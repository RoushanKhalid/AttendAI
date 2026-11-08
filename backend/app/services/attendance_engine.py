from datetime import datetime, date, time, timedelta
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.cache import cache_manager
from app.core.logging import logger
from app.models import (
    Employee, Shift, AttendanceLog, DailyAttendance
)


class AttendanceEngine:
    @staticmethod
    def determine_attendance_date(punch_dt: datetime, shift: Shift) -> date:
        """
        Determines the operational business attendance date for the punch.
        If a shift crosses midnight (overnight) and current time is before the boundary,
        the punch belongs to the previous calendar day's shift.
        """
        if shift.is_overnight:
            boundary = shift.shift_day_boundary or time(12, 0)
            if punch_dt.time() < boundary:
                return punch_dt.date() - timedelta(days=1)
        return punch_dt.date()

    def process_punch(
        self,
        db: Session,
        employee_id: str,
        device_id: str = "kiosk_terminal_1",
        punch_type: str = "AUTO",
        confidence_score: float = 1.0,
        liveness_score: float = 1.0,
        verification_mode: str = "FACE_RECOGNITION"
    ) -> Dict[str, Any]:
        """
        Processes a validated face recognition event:
        1. Debounces rapid duplicates (atomic Redis/cache lock).
        2. Inserts raw punch into `attendance_logs`.
        3. Computes/updates daily aggregated record in `daily_attendance`.
        """
        now = datetime.utcnow()
        debounce_key = f"attendance:debounce:{employee_id}"

        # 1. Check Debounce
        is_fresh = cache_manager.set_if_not_exists(
            debounce_key,
            now.isoformat(),
            ttl_seconds=settings.PUNCH_DEBOUNCE_SECONDS
        )

        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            return {
                "success": False,
                "is_duplicate": False,
                "message": "Employee not found",
                "employee_id": employee_id
            }

        if not is_fresh:
            logger.info("Debounced duplicate punch for employee: %s (%s)", emp.full_name, emp.employee_code)
            # Retrieve latest status
            target_date = self.determine_attendance_date(now, emp.default_shift)
            daily = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == emp.id,
                DailyAttendance.attendance_date == target_date
            ).first()
            return {
                "success": True,
                "is_duplicate": True,
                "message": f"Attendance already logged recently. Welcome back, {emp.full_name}!",
                "punch_time": now,
                "employee_id": emp.id,
                "employee_name": emp.full_name,
                "employee_code": emp.employee_code,
                "punch_type": punch_type,
                "daily_status": daily.status if daily else "PRESENT",
                "late_minutes": daily.late_minutes if daily else 0,
                "total_work_minutes": daily.total_work_minutes if daily else 0
            }

        # 2. Record Raw Attendance Log
        raw_log = AttendanceLog(
            employee_id=emp.id,
            punch_time=now,
            device_id=device_id,
            confidence_score=confidence_score,
            liveness_score=liveness_score,
            punch_type=punch_type,
            verification_mode=verification_mode
        )
        db.add(raw_log)

        # 3. Determine Shift & Daily Record
        shift = emp.default_shift
        target_date = self.determine_attendance_date(now, shift)
        
        daily = db.query(DailyAttendance).filter(
            DailyAttendance.employee_id == emp.id,
            DailyAttendance.attendance_date == target_date
        ).first()

        effective_punch_type = punch_type

        if not daily:
            # First Punch of the Day -> CHECK_IN
            effective_punch_type = "CHECK_IN"
            late_mins = self._calculate_late_minutes(now.time(), shift)
            
            if late_mins > shift.half_day_late_mins:
                status = "HALF_DAY"
            elif late_mins > 0:
                status = "LATE"
            else:
                status = "PRESENT"

            daily = DailyAttendance(
                employee_id=emp.id,
                shift_id=shift.id,
                attendance_date=target_date,
                check_in_time=now,
                late_minutes=late_mins,
                status=status
            )
            db.add(daily)
            raw_log.punch_type = "CHECK_IN"
            message = f"Check-In recorded at {now.strftime('%I:%M %p')}. Status: {status}."
        else:
            # Subsequent Punch -> CHECK_OUT
            effective_punch_type = "CHECK_OUT"
            daily.check_out_time = now
            raw_log.punch_type = "CHECK_OUT"

            # Compute gross & net minutes
            if daily.check_in_time:
                gross_seconds = (now - daily.check_in_time).total_seconds()
                gross_minutes = int(gross_seconds // 60)
                # Deduct standard break if worked > 5 hours
                break_mins = shift.break_duration_mins if gross_minutes >= 300 else 0
                daily.total_work_minutes = max(0, gross_minutes - break_mins)

                # Overtime evaluation
                ot_mins = self._calculate_overtime_minutes(now.time(), shift)
                daily.overtime_minutes = ot_mins

                # Early departure evaluation
                early_mins = self._calculate_early_minutes(now.time(), shift)
                daily.early_departure_minutes = early_mins

            message = f"Check-Out recorded at {now.strftime('%I:%M %p')}. Total worked: {daily.total_work_minutes} mins."

        db.commit()
        db.refresh(daily)

        logger.info(
            "Attendance successfully recorded: Emp [%s] %s | Type: %s | Status: %s",
            emp.employee_code, emp.full_name, effective_punch_type, daily.status
        )

        return {
            "success": True,
            "is_duplicate": False,
            "message": message,
            "punch_time": now,
            "employee_id": emp.id,
            "employee_name": emp.full_name,
            "employee_code": emp.employee_code,
            "punch_type": effective_punch_type,
            "daily_status": daily.status,
            "late_minutes": daily.late_minutes,
            "total_work_minutes": daily.total_work_minutes
        }

    def _calculate_late_minutes(self, punch_time: time, shift: Shift) -> int:
        shift_start = shift.start_time
        shift_start_mins = shift_start.hour * 60 + shift_start.minute
        punch_mins = punch_time.hour * 60 + punch_time.minute
        grace = shift.grace_period_mins

        if punch_mins > (shift_start_mins + grace):
            return punch_mins - shift_start_mins
        return 0

    def _calculate_early_minutes(self, punch_time: time, shift: Shift) -> int:
        shift_end = shift.end_time
        shift_end_mins = shift_end.hour * 60 + shift_end.minute
        punch_mins = punch_time.hour * 60 + punch_time.minute

        if punch_mins < shift_end_mins and not shift.is_overnight:
            return shift_end_mins - punch_mins
        return 0

    def _calculate_overtime_minutes(self, punch_time: time, shift: Shift) -> int:
        shift_end = shift.end_time
        shift_end_mins = shift_end.hour * 60 + shift_end.minute
        punch_mins = punch_time.hour * 60 + punch_time.minute

        # Overtime starts after 30 minutes past shift end
        if punch_mins > (shift_end_mins + 30) and not shift.is_overnight:
            return punch_mins - shift_end_mins
        return 0


attendance_engine = AttendanceEngine()
