from fastapi import APIRouter
from app.api.auth import router as auth_router
from app.api.employees import router as employees_router
from app.api.face import router as face_router
from app.api.attendance import router as attendance_router
from app.api.dashboard import router as dashboard_router
from app.api.shifts import router as shifts_router
from app.api.leaves import router as leaves_router
from app.api.holidays import router as holidays_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(employees_router)
api_router.include_router(face_router)
api_router.include_router(attendance_router)
api_router.include_router(dashboard_router)
api_router.include_router(shifts_router)
api_router.include_router(leaves_router)
api_router.include_router(holidays_router)

