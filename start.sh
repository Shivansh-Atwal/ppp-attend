#!/bin/bash

echo "Starting TNP Attendance System..."
echo

echo "Installing dependencies..."
npm run install-all

echo
echo "Starting both backend and frontend..."
echo "Backend will run on http://localhost:5000"
echo "Frontend will run on http://localhost:5173"
echo

npm run dev
