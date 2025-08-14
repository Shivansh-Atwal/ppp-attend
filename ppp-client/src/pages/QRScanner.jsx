import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  QrCode, 
  User, 
  Calendar, 
  MapPin, 
  Clock, 
  CheckCircle, 
  XCircle,
  ArrowLeft,
  Download,
  Camera,
  AlertCircle,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
  Smartphone,
  Scan,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import jsQR from 'jsqr';

const QRScanner = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const [scannedData, setScannedData] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [scanningStatus, setScanningStatus] = useState('idle'); // idle, scanning, detected
  const [scannedQRData, setScannedQRData] = useState('');

  // Start camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsScanning(true);
      setScanningStatus('scanning');

      // Try different camera constraints for better compatibility
      const constraints = {
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          aspectRatio: { ideal: 16/9 }
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        // Fallback to basic constraints if advanced ones fail
        console.log('Advanced constraints failed, trying basic constraints');
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
      }

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsCameraActive(true);
          startQRDetection();
        };
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError(error.message);
      setIsScanning(false);
      setScanningStatus('idle');
      
      if (error.name === 'NotAllowedError') {
        toast.error('Camera access denied. Please allow camera permissions.');
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera found on this device.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('Camera not supported on this device.');
      } else {
        toast.error('Failed to start camera. Please try again.');
      }
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsCameraActive(false);
    setIsScanning(false);
    setScanningStatus('idle');
  };

  // Start QR detection loop
  const startQRDetection = () => {
    if (!isCameraActive) return;
    
    const detectQR = () => {
      if (!videoRef.current || !canvasRef.current || !isCameraActive) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data for QR detection
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Use jsQR to detect QR codes
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        console.log('QR Code detected:', code.data);
        handleQRDetected(code.data);
        return; // Stop scanning after successful detection
      }
      
      // Continue scanning
      if (isCameraActive) {
        animationFrameRef.current = requestAnimationFrame(detectQR);
      }
    };

    detectQR();
  };

  // Handle QR code detection
  const handleQRDetected = (qrData) => {
    console.log('QR Code detected, processing:', qrData);
    
    // Prevent multiple scans in quick succession
    const now = Date.now();
    if (lastScanTime && now - lastScanTime < 2000) {
      console.log('Scan too soon, ignoring');
      return;
    }
    setLastScanTime(now);

    setScanAttempts(prev => prev + 1);
    setScanningStatus('detected');
    processQRData(qrData);
  };

  // Process QR data
  const processQRData = async (qrData) => {
    console.log('Processing QR data:', qrData);
    setIsProcessing(true);
    toast.loading('Processing QR code...');
    
    try {
      let parsedData;
      
      // Try to parse QR data as JSON
      try {
        parsedData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
        console.log('Parsed QR data:', parsedData);
      } catch (parseError) {
        console.log('Failed to parse as JSON, treating as string:', parseError);
        // If parsing fails, treat as simple string data
        parsedData = {
          userId: qrData,
          rollNo: qrData,
          timestamp: Date.now(),
          type: "user_attendance"
        };
      }

      // Validate QR data structure
      if (!parsedData.userId && !parsedData.rollNo) {
        throw new Error('Invalid QR code format - missing user ID or roll number');
      }
      
      setScannedData(parsedData);
      setScannedQRData(JSON.stringify(parsedData, null, 2));
      
      console.log('Sending QR data to backend:', parsedData);
      
      // Fetch user details from backend
      const response = await fetch('http://localhost:5000/api/qr/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ qrData: JSON.stringify(parsedData) })
      });

      const result = await response.json();
      console.log('Backend response:', result);
      
      if (response.ok && result.user) {
        setUserDetails(result.user);
        toast.dismiss();
        toast.success('QR code scanned successfully!');
        stopCamera();
      } else {
        toast.dismiss();
        toast.error(result.error || 'Failed to process QR code');
        console.error('Backend error:', result.error);
      }
    } catch (error) {
      console.error('QR processing error:', error);
      toast.dismiss();
      toast.error(`Failed to process QR code: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual QR input (fallback)
  const handleManualQRInput = () => {
    const qrData = prompt('Enter QR code data manually:');
    if (qrData) {
      processQRData(qrData);
    }
  };

  // Simulate QR scan (for testing)
  const simulateQRScan = () => {
    const mockQRData = {
      userId: "507f1f77bcf86cd799439011", // Mock MongoDB ObjectId
      rollNo: "2024CS001",
      name: "John Doe",
      trade: "Computer Science",
      timestamp: Date.now(),
      type: "user_attendance"
    };
    processQRData(mockQRData);
  };

  // Navigate to attendance marking page
  const goToAttendanceMarking = () => {
    if (userDetails) {
      // Navigate to attendance marking page with user data
      navigate('/mark-attendance', { 
        state: { 
          user: userDetails,
          scannedData: scannedData 
        } 
      });
    }
  };

  // Reset scanner
  const resetScanner = () => {
    setScannedData(null);
    setUserDetails(null);
    setScannedQRData('');
    setScanAttempts(0);
    setLastScanTime(null);
    setCameraError(null);
    setScanningStatus('idle');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            QR Scanner
          </h1>
          
          <div className="w-20"></div>
        </motion.div>

        {!scannedData ? (
          /* QR Scanner Interface */
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl p-8 text-center"
          >
            <div className="w-32 h-32 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Scan className="w-16 h-16 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Scan Student QR Code
            </h2>
            
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Position the student's QR code within the camera view to scan and verify their attendance.
            </p>

            {/* Camera View */}
            <div className="relative w-80 h-80 mx-auto mb-8 border-4 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
              {cameraError ? (
                <div className="flex flex-col items-center justify-center h-full p-4">
                  <WifiOff className="w-12 h-12 text-red-400 mb-4" />
                  <p className="text-red-600 text-sm mb-2">Camera Error</p>
                  <p className="text-gray-500 text-xs text-center">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    Retry Camera
                  </button>
                </div>
              ) : isCameraActive ? (
                <div className="relative h-full">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full opacity-0"
                  />
                  
                  {/* Scanning overlay */}
                  <div className={`absolute inset-0 border-2 rounded-lg ${
                    scanningStatus === 'detected' 
                      ? 'border-green-500 bg-green-500 bg-opacity-20' 
                      : 'border-blue-500 animate-pulse'
                  }`}>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-white rounded-lg">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-500"></div>
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-500"></div>
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-500"></div>
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-500"></div>
                    </div>
                    
                    {/* Scanning line animation */}
                    {scanningStatus === 'scanning' && (
                      <div className="absolute top-1/2 left-0 w-full h-0.5 bg-blue-500 animate-pulse">
                        <div className="w-full h-full bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-ping"></div>
                      </div>
                    )}
                    
                    {/* Status indicator */}
                    {scanningStatus === 'detected' && (
                      <div className="absolute top-4 right-4 bg-green-500 text-white px-2 py-1 rounded text-xs animate-bounce">
                        QR Detected!
                      </div>
                    )}
                    
                    {/* Scanning text */}
                    {scanningStatus === 'scanning' && (
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                        Scanning...
                      </div>
                    )}
                  </div>
                </div>
              ) : isScanning ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-500 mb-2">Starting Camera...</p>
                  <p className="text-sm text-gray-400 text-center">Please wait</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <Camera className="w-16 h-16 text-gray-400 mb-4" />
                  <p className="text-gray-500 mb-2">Camera Ready</p>
                  <p className="text-sm text-gray-400 text-center">Click start to begin scanning</p>
                </div>
              )}
            </div>

            {/* Camera Controls */}
            <div className="flex justify-center space-x-4 mb-6">
              {!isCameraActive ? (
                <button
                  onClick={startCamera}
                  disabled={isScanning}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Camera className="w-5 h-5" />
                  <span>Start Camera</span>
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 transition-all duration-300 flex items-center space-x-2"
                >
                  <XCircle className="w-5 h-5" />
                  <span>Stop Camera</span>
                </button>
              )}
              
              <button
                onClick={simulateQRScan}
                disabled={isScanning || isProcessing}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Smartphone className="w-5 h-5" />
                <span>Test Scan</span>
              </button>
            </div>

            {/* Manual Input Option */}
            <div className="mb-6">
              <button
                onClick={handleManualQRInput}
                className="text-blue-600 hover:text-blue-700 text-sm underline"
              >
                Enter QR code manually
              </button>
            </div>

            {/* Scanning Stats */}
            {scanAttempts > 0 && (
              <div className="mb-6 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  Scan attempts: {scanAttempts}
                </p>
              </div>
            )}

            {/* Tips */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-2 text-blue-700 mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Tips for scanning:</span>
              </div>
              <ul className="text-sm text-blue-600 space-y-1">
                <li>• Ensure good lighting conditions</li>
                <li>• Hold the QR code steady within the frame</li>
                <li>• Keep the code at a reasonable distance</li>
                <li>• Wait for the scan confirmation</li>
                <li>• Use the test scan button for development</li>
              </ul>
            </div>
          </motion.div>
        ) : (
          /* User Verification Interface */
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* User Details Card */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Student Verification</h2>
                  <p className="text-gray-600">Please verify the student details below</p>
                </div>
              </div>

              {isProcessing ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading student details...</p>
                </div>
              ) : userDetails ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <div className="p-3 bg-gray-50 rounded-lg border">
                        {userDetails.name}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                      <div className="p-3 bg-gray-50 rounded-lg border">
                        {userDetails.roll_no}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Trade/Department</label>
                      <div className="p-3 bg-gray-50 rounded-lg border">
                        {userDetails.trade}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <div className="p-3 bg-gray-50 rounded-lg border">
                        {userDetails.email}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex space-x-3">
                      <button
                        onClick={resetScanner}
                        className="flex-1 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Scan Another</span>
                      </button>
                      <button
                        onClick={() => setUserDetails(null)}
                        className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center space-x-2"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">QR Code scanned but user not found</p>
                  <div className="bg-gray-100 p-4 rounded-lg text-left">
                    <p className="text-sm text-gray-700 mb-2">Scanned QR Data:</p>
                    <pre className="text-xs text-gray-600 overflow-x-auto">{scannedQRData}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {userDetails && (
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Next Steps</h3>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center space-x-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Student verified successfully!</span>
                  </div>
                  <p className="text-green-700 mt-2">
                    Click the button below to proceed to attendance marking.
                  </p>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={goToAttendanceMarking}
                    className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Calendar className="w-5 h-5" />
                    <span>Mark Attendance</span>
                  </button>
                  <button
                    onClick={resetScanner}
                    className="flex-1 bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Scan Another
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
