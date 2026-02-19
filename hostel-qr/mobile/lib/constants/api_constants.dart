// =====================================================
// API SERVICE
// =====================================================

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  final _storage = const FlutterSecureStorage();
  String? _accessToken;

  // =====================================================
  // TOKEN MANAGEMENT
  // =====================================================

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    _accessToken = accessToken;
    await _storage.write(key: AppConstants.keyAccessToken, value: accessToken);
    await _storage.write(key: AppConstants.keyRefreshToken, value: refreshToken);
  }

  Future<String?> getAccessToken() async {
    _accessToken ??= await _storage.read(key: AppConstants.keyAccessToken);
    return _accessToken;
  }

  Future<void> clearTokens() async {
    _accessToken = null;
    await _storage.delete(key: AppConstants.keyAccessToken);
    await _storage.delete(key: AppConstants.keyRefreshToken);
  }

  // =====================================================
  // HTTP METHODS
  // =====================================================

  Future<Map<String, dynamic>> get(String endpoint, {bool requiresAuth = true}) async {
    try {
      final url = Uri.parse('${AppConstants.baseUrl}$endpoint');
      final headers = await _getHeaders(requiresAuth);

      final response = await http.get(url, headers: headers)
          .timeout(const Duration(seconds: 30));

      return _handleResponse(response);
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> post(
    String endpoint,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    try {
      final url = Uri.parse('${AppConstants.baseUrl}$endpoint');
      final headers = await _getHeaders(requiresAuth);

      final response = await http.post(
        url,
        headers: headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 30));

      return _handleResponse(response);
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> put(
    String endpoint,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    try {
      final url = Uri.parse('${AppConstants.baseUrl}$endpoint');
      final headers = await _getHeaders(requiresAuth);

      final response = await http.put(
        url,
        headers: headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 30));

      return _handleResponse(response);
    } catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> delete(String endpoint, {bool requiresAuth = true}) async {
    try {
      final url = Uri.parse('${AppConstants.baseUrl}$endpoint');
      final headers = await _getHeaders(requiresAuth);

      final response = await http.delete(url, headers: headers)
          .timeout(const Duration(seconds: 30));

      return _handleResponse(response);
    } catch (e) {
      throw _handleError(e);
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  Future<Map<String, String>> _getHeaders(bool requiresAuth) async {
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (requiresAuth) {
      final token = await getAccessToken();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    return headers;
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final body = jsonDecode(response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    } else {
      throw ApiException(
        statusCode: response.statusCode,
        message: body['message'] ?? 'Unknown error occurred',
        data: body,
      );
    }
  }

  String _handleError(dynamic error) {
    if (error is ApiException) {
      return error.message;
    }
    return 'Network error. Please check your connection.';
  }

  // =====================================================
  // AUTHENTICATION APIS
  // =====================================================

  Future<Map<String, dynamic>> studentRegister({
    required String collegeId,
    required String studentName,
    required String password,
    required String parentPhone,
    String? email,
    String? department,
    int? yearOfStudy,
  }) async {
    return await post(
      AppConstants.endpointStudentRegister,
      {
        'collegeId': collegeId,
        'studentName': studentName,
        'password': password,
        'parentPhone': parentPhone,
        if (email != null) 'email': email,
        if (department != null) 'department': department,
        if (yearOfStudy != null) 'yearOfStudy': yearOfStudy,
      },
      requiresAuth: false,
    );
  }

  Future<Map<String, dynamic>> studentLogin({
    required String collegeId,
    required String password,
  }) async {
    final response = await post(
      AppConstants.endpointStudentLogin,
      {
        'collegeId': collegeId,
        'password': password,
      },
      requiresAuth: false,
    );

    if (response['success'] && response['data']?['accessToken'] != null) {
      await saveTokens(
        response['data']['accessToken'],
        response['data']['refreshToken'],
      );
    }

    return response;
  }

  Future<Map<String, dynamic>> parentRegister({
    required String phoneNumber,
    required String parentName,
    String? relationship,
    String? alternatePhone,
    String? address,
  }) async {
    return await post(
      AppConstants.endpointParentRegister,
      {
        'phoneNumber': phoneNumber,
        'parentName': parentName,
        if (relationship != null) 'relationship': relationship,
        if (alternatePhone != null) 'alternatePhone': alternatePhone,
        if (address != null) 'address': address,
      },
      requiresAuth: false,
    );
  }

  Future<Map<String, dynamic>> verifyParentOTP({
    required String phoneNumber,
    required String otp,
  }) async {
    final response = await post(
      AppConstants.endpointParentVerifyOTP,
      {
        'phoneNumber': phoneNumber,
        'otp': otp,
      },
      requiresAuth: false,
    );

    if (response['success'] && response['data']?['accessToken'] != null) {
      await saveTokens(
        response['data']['accessToken'],
        response['data']['refreshToken'],
      );
    }

    return response;
  }

  Future<Map<String, dynamic>> requestParentOTP({
    required String phoneNumber,
  }) async {
    return await post(
      AppConstants.endpointParentRequestOTP,
      {'phoneNumber': phoneNumber},
      requiresAuth: false,
    );
  }

  Future<Map<String, dynamic>> parentLogin({
    required String phoneNumber,
    required String otp,
  }) async {
    final response = await post(
      AppConstants.endpointParentLogin,
      {
        'phoneNumber': phoneNumber,
        'otp': otp,
      },
      requiresAuth: false,
    );

    if (response['success'] && response['data']?['accessToken'] != null) {
      await saveTokens(
        response['data']['accessToken'],
        response['data']['refreshToken'],
      );
    }

    return response;
  }

  // =====================================================
  // STUDENT APIS
  // =====================================================

  Future<Map<String, dynamic>> getStudentProfile() async {
    return await get(AppConstants.endpointStudentProfile);
  }

  Future<Map<String, dynamic>> getStudentDashboard() async {
    return await get(AppConstants.endpointStudentDashboard);
  }

  Future<Map<String, dynamic>> completeProfile({
    String? phoneNumber,
    String? hostelBlock,
    String? roomNumber,
  }) async {
    return await post(
      AppConstants.endpointStudentCompleteProfile,
      {
        if (phoneNumber != null) 'phoneNumber': phoneNumber,
        if (hostelBlock != null) 'hostelBlock': hostelBlock,
        if (roomNumber != null) 'roomNumber': roomNumber,
      },
    );
  }

  Future<Map<String, dynamic>> applyLeave({
    required String fromDate,
    required String toDate,
    required String reason,
    String? destination,
    String? contactDuringLeave,
    String? leaveType,
  }) async {
    return await post(
      AppConstants.endpointStudentApplyLeave,
      {
        'fromDate': fromDate,
        'toDate': toDate,
        'reason': reason,
        if (destination != null) 'destination': destination,
        if (contactDuringLeave != null) 'contactDuringLeave': contactDuringLeave,
        if (leaveType != null) 'leaveType': leaveType,
      },
    );
  }

  Future<Map<String, dynamic>> getMyLeaves() async {
    return await get(AppConstants.endpointStudentMyLeaves);
  }

  Future<Map<String, dynamic>> getLeaveQRCode(int leaveId) async {
    return await get('/student/leave/$leaveId/qr-code');
  }

  // =====================================================
  // PARENT APIS
  // =====================================================

  Future<Map<String, dynamic>> getParentDashboard() async {
    return await get(AppConstants.endpointParentDashboard);
  }

  Future<Map<String, dynamic>> getChildrenLeaves({String? status}) async {
    String endpoint = AppConstants.endpointParentLeaves;
    if (status != null) {
      endpoint += '?status=$status';
    }
    return await get(endpoint);
  }

  Future<Map<String, dynamic>> requestEmergencyExtension({
    required int leaveId,
    required String extendedToDate,
    required String reason,
  }) async {
    return await post(
      AppConstants.endpointParentEmergencyExtension,
      {
        'leaveId': leaveId,
        'extendedToDate': extendedToDate,
        'reason': reason,
      },
    );
  }

  // =====================================================
  // WATCHMAN APIS
  // =====================================================

  Future<Map<String, dynamic>> scanQRCode({
    required String qrData,
    required String actionType,
    String? location,
  }) async {
    return await post(
      AppConstants.endpointWatchmanScanQR,
      {
        'qrData': qrData,
        'actionType': actionType,
        if (location != null) 'location': location,
      },
    );
  }

  Future<Map<String, dynamic>> getGateLogs({
    String? date,
    String? actionType,
  }) async {
    String endpoint = AppConstants.endpointWatchmanGateLogs;
    final params = <String>[];
    if (date != null) params.add('date=$date');
    if (actionType != null) params.add('actionType=$actionType');
    if (params.isNotEmpty) {
      endpoint += '?${params.join('&')}';
    }
    return await get(endpoint);
  }
}

// =====================================================
// API EXCEPTION CLASS
// =====================================================

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final Map<String, dynamic>? data;

  ApiException({
    required this.statusCode,
    required this.message,
    this.data,
  });

  @override
  String toString() => message;
}