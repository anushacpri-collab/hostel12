// =====================================================
// APP CONSTANTS & CONFIGURATION
// =====================================================

class AppConstants {
  // API Configuration
  static const String baseUrl = 'http://localhost:3000/api';
  static const int connectionTimeout = 30000; // 30 seconds
  static const int receiveTimeout = 30000;

  // Storage Keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUserId = 'user_id';
  static const String keyUserRole = 'user_role';
  static const String keyUserData = 'user_data';
  static const String keyLanguage = 'language';

  // API Endpoints
  static const String endpointHealth = '/health';
  
  // Auth
  static const String endpointStudentRegister = '/auth/student/register';
  static const String endpointStudentLogin = '/auth/student/login';
  static const String endpointParentRegister = '/auth/parent/register';
  static const String endpointParentVerifyOTP = '/auth/parent/verify-otp';
  static const String endpointParentRequestOTP = '/auth/parent/request-otp';
  static const String endpointParentLogin = '/auth/parent/login';
  static const String endpointStaffLogin = '/auth/staff/login';
  
  // Student
  static const String endpointStudentProfile = '/student/profile';
  static const String endpointStudentDashboard = '/student/dashboard';
  static const String endpointStudentCompleteProfile = '/student/profile/complete';
  static const String endpointStudentApplyLeave = '/student/leave/apply';
  static const String endpointStudentMyLeaves = '/student/leave/my-leaves';
  
  // Parent
  static const String endpointParentDashboard = '/parent/dashboard';
  static const String endpointParentLeaves = '/parent/leaves';
  static const String endpointParentEmergencyExtension = '/parent/leave/emergency-extension';
  static const String endpointParentNotifications = '/parent/notifications';
  
  // Watchman
  static const String endpointWatchmanScanQR = '/watchman/scan-qr';
  static const String endpointWatchmanGateLogs = '/watchman/gate-logs';
  static const String endpointWatchmanManualEntry = '/watchman/manual-entry';
  static const String endpointWatchmanStudentsOutside = '/watchman/students-outside';

  // App Settings
  static const int maxLeaveRegularDays = 15;
  static const int minAdvanceDays = 2;
  
  // Date Formats
  static const String dateFormatDisplay = 'dd MMM yyyy';
  static const String dateFormatAPI = 'yyyy-MM-dd';
  static const String dateTimeFormatDisplay = 'dd MMM yyyy, hh:mm a';
  
  // Colors
  static const int primaryColor = 0xFF2196F3;
  static const int secondaryColor = 0xFF4CAF50;
  static const int accentColor = 0xFFFF9800;
  static const int errorColor = 0xFFF44336;
  static const int warningColor = 0xFFFFC107;
  static const int successColor = 0xFF4CAF50;
  
  // Status Colors
  static const int pendingColor = 0xFFFFC107;
  static const int approvedColor = 0xFF4CAF50;
  static const int rejectedColor = 0xFFF44336;
  
  // Validation
  static const int minPasswordLength = 6;
  static const int otpLength = 6;
  static const int phoneNumberLength = 10;
}

// =====================================================
// APP STRINGS (English)
// =====================================================

class AppStrings {
  // App
  static const String appName = 'Hostel QR System';
  static const String appTagline = 'Smart Entry Authorization';
  
  // Common
  static const String ok = 'OK';
  static const String cancel = 'Cancel';
  static const String submit = 'Submit';
  static const String save = 'Save';
  static const String delete = 'Delete';
  static const String edit = 'Edit';
  static const String view = 'View';
  static const String close = 'Close';
  static const String retry = 'Retry';
  static const String loading = 'Loading...';
  static const String noData = 'No data available';
  static const String error = 'Error';
  static const String success = 'Success';
  static const String warning = 'Warning';
  
  // Auth
  static const String login = 'Login';
  static const String logout = 'Logout';
  static const String register = 'Register';
  static const String welcomeBack = 'Welcome Back!';
  static const String createAccount = 'Create Account';
  static const String forgotPassword = 'Forgot Password?';
  
  // Student
  static const String studentLogin = 'Student Login';
  static const String studentRegister = 'Student Registration';
  static const String collegeId = 'College ID';
  static const String password = 'Password';
  static const String confirmPassword = 'Confirm Password';
  static const String studentName = 'Student Name';
  static const String department = 'Department';
  static const String yearOfStudy = 'Year of Study';
  static const String hostelBlock = 'Hostel Block';
  static const String roomNumber = 'Room Number';
  static const String parentPhone = 'Parent Phone Number';
  
  // Parent
  static const String parentLogin = 'Parent Login';
  static const String parentRegister = 'Parent Registration';
  static const String parentName = 'Parent Name';
  static const String relationship = 'Relationship';
  static const String phoneNumber = 'Phone Number';
  static const String otpVerification = 'OTP Verification';
  static const String enterOTP = 'Enter OTP';
  static const String resendOTP = 'Resend OTP';
  static const String verifyOTP = 'Verify OTP';
  
  // Leave
  static const String applyLeave = 'Apply Leave';
  static const String leaveHistory = 'Leave History';
  static const String fromDate = 'From Date';
  static const String toDate = 'To Date';
  static const String reason = 'Reason';
  static const String destination = 'Destination';
  static const String contactDuringLeave = 'Contact During Leave';
  static const String leaveType = 'Leave Type';
  static const String pending = 'Pending';
  static const String approved = 'Approved';
  static const String rejected = 'Rejected';
  static const String leaveStatus = 'Leave Status';
  
  // QR Code
  static const String scanQRCode = 'Scan QR Code';
  static const String showQRCode = 'Show QR Code';
  static const String qrCodeValid = 'QR Code Valid';
  static const String qrCodeInvalid = 'QR Code Invalid';
  
  // Dashboard
  static const String dashboard = 'Dashboard';
  static const String profile = 'Profile';
  static const String notifications = 'Notifications';
  static const String settings = 'Settings';
  
  // Messages
  static const String accountLockedParentVerification = 
      'Your account is locked. Please ask your parent to verify their account.';
  static const String parentVerificationPending = 
      'Parent verification is pending. Your account will be activated once your parent verifies.';
  static const String profileIncomplete = 
      'Please complete your profile to access all features.';
  static const String leaveAppliedSuccess = 
      'Leave application submitted successfully.';
  static const String leaveApproved = 
      'Your leave has been approved.';
  static const String leaveRejected = 
      'Your leave has been rejected.';
}

// =====================================================
// APP STRINGS (Tamil)
// =====================================================

class AppStringsTamil {
  // App
  static const String appName = 'விடுதி QR அமைப்பு';
  static const String appTagline = 'ஸ்மார்ட் நுழைவு அங்கீகாரம்';
  
  // Common
  static const String ok = 'சரி';
  static const String cancel = 'ரத்து செய்';
  static const String submit = 'சமர்ப்பிக்கவும்';
  static const String save = 'சேமி';
  static const String delete = 'நீக்கு';
  static const String edit = 'திருத்து';
  static const String view = 'பார்';
  static const String close = 'மூடு';
  static const String retry = 'மீண்டும் முயற்சி';
  static const String loading = 'ஏற்றுகிறது...';
  static const String noData = 'தரவு இல்லை';
  static const String error = 'பிழை';
  static const String success = 'வெற்றி';
  static const String warning = 'எச்சரிக்கை';
  
  // Auth
  static const String login = 'உள்நுழைவு';
  static const String logout = 'வெளியேறு';
  static const String register = 'பதிவு செய்';
  static const String welcomeBack = 'மீண்டும் வரவேற்கிறோம்!';
  static const String createAccount = 'கணக்கை உருவாக்கு';
  
  // Student
  static const String studentLogin = 'மாணவர் உள்நுழைவு';
  static const String studentRegister = 'மாணவர் பதிவு';
  static const String collegeId = 'கல்லூரி அடையாள எண்';
  static const String password = 'கடவுச்சொல்';
  static const String studentName = 'மாணவர் பெயர்';
  static const String department = 'துறை';
  static const String hostelBlock = 'விடுதி தொகுதி';
  static const String roomNumber = 'அறை எண்';
  static const String parentPhone = 'பெற்றோர் தொலைபேசி எண்';
  
  // Parent
  static const String parentLogin = 'பெற்றோர் உள்நுழைவு';
  static const String parentRegister = 'பெற்றோர் பதிவு';
  static const String parentName = 'பெற்றோர் பெயர்';
  static const String phoneNumber = 'தொலைபேசி எண்';
  static const String otpVerification = 'OTP சரிபார்ப்பு';
  static const String enterOTP = 'OTP ஐ உள்ளிடவும்';
  static const String verifyOTP = 'OTP ஐ சரிபார்க்கவும்';
  
  // Leave
  static const String applyLeave = 'விடுப்பு விண்ணப்பிக்கவும்';
  static const String leaveHistory = 'விடுப்பு வரலாறு';
  static const String fromDate = 'தொடக்க தேதி';
  static const String toDate = 'முடிவு தேதி';
  static const String reason = 'காரணம்';
  static const String pending = 'நிலுவையில்';
  static const String approved = 'ஒப்புதல்';
  static const String rejected = 'நிராகரிக்கப்பட்டது';
  
  // Dashboard
  static const String dashboard = 'முகப்பு';
  static const String profile = 'சுயவிவரம்';
  static const String notifications = 'அறிவிப்புகள்';
  static const String settings = 'அமைப்புகள்';
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

class AppHelpers {
  // Get string based on language
  static String getString(String key, {String? language}) {
    language ??= 'en'; // Default to English
    
    // This is a simple implementation
    // In production, use proper i18n package
    if (language == 'ta') {
      // Return Tamil string
      switch (key) {
        case 'appName':
          return AppStringsTamil.appName;
        case 'login':
          return AppStringsTamil.login;
        // Add more cases as needed
        default:
          return key;
      }
    } else {
      // Return English string
      switch (key) {
        case 'appName':
          return AppStrings.appName;
        case 'login':
          return AppStrings.login;
        // Add more cases as needed
        default:
          return key;
      }
    }
  }
}