-- =====================================================
-- HOSTEL ENTRY AUTHORIZATION SYSTEM - DATABASE SCHEMA
-- =====================================================

DROP DATABASE IF EXISTS hostel_qr_system;
CREATE DATABASE hostel_qr_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hostel_qr_system;

-- =====================================================
-- USER ROLES TABLE
-- =====================================================
CREATE TABLE roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, description) VALUES
('STUDENT', 'Student role with leave application privileges'),
('PARENT', 'Parent role for verification and monitoring'),
('DEPUTY_WARDEN', 'Deputy warden with approval authority'),
('PRINCIPAL', 'Principal with authority for long leaves'),
('WATCHMAN', 'Watchman for QR scanning at gate');

-- =====================================================
-- USERS TABLE (All users)
-- =====================================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_id INT NOT NULL,
    phone_number VARCHAR(15) UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- =====================================================
-- STUDENTS TABLE
-- =====================================================
CREATE TABLE students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    college_id VARCHAR(20) NOT NULL UNIQUE,
    student_name VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    year_of_study INT,
    hostel_block VARCHAR(50),
    room_number VARCHAR(10),
    parent_phone VARCHAR(15) NOT NULL,
    parent_id INT NULL, -- Links to parent user_id after parent registration
    profile_completed BOOLEAN DEFAULT FALSE,
    photo_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- PARENTS TABLE
-- =====================================================
CREATE TABLE parents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    parent_name VARCHAR(100),
    relationship VARCHAR(50), -- Father, Mother, Guardian
    alternate_phone VARCHAR(15),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- STAFF TABLE (Deputy Warden, Principal, Watchman)
-- =====================================================
CREATE TABLE staff (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    staff_name VARCHAR(100) NOT NULL,
    employee_id VARCHAR(20) UNIQUE,
    designation VARCHAR(100),
    department VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- OTP VERIFICATION TABLE
-- =====================================================
CREATE TABLE otp_verifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- REGISTRATION, LOGIN, VERIFICATION
    is_verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_phone_otp (phone_number, otp_code),
    INDEX idx_expires (expires_at)
);

-- =====================================================
-- LEAVE APPLICATIONS TABLE
-- =====================================================
CREATE TABLE leave_applications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    leave_type VARCHAR(50) DEFAULT 'REGULAR', -- REGULAR, EMERGENCY, MEDICAL
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason TEXT NOT NULL,
    destination VARCHAR(255),
    contact_during_leave VARCHAR(15),
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED_DW, APPROVED_PRINCIPAL, REJECTED, EXPIRED
    approved_by_dw INT NULL,
    approved_by_principal INT NULL,
    dw_remarks TEXT,
    principal_remarks TEXT,
    dw_approved_at TIMESTAMP NULL,
    principal_approved_at TIMESTAMP NULL,
    qr_code_generated BOOLEAN DEFAULT FALSE,
    qr_code_data TEXT,
    qr_code_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by_dw) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by_principal) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_student_status (student_id, status),
    INDEX idx_status_dates (status, from_date, to_date)
);

-- =====================================================
-- EMERGENCY EXTENSION REQUESTS TABLE
-- =====================================================
CREATE TABLE emergency_extensions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    leave_application_id INT NOT NULL,
    requested_by_parent INT NOT NULL,
    extended_to_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    approved_by INT NULL,
    remarks TEXT,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (leave_application_id) REFERENCES leave_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by_parent) REFERENCES parents(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES staff(id) ON DELETE SET NULL
);

-- =====================================================
-- GATE ENTRY/EXIT LOGS TABLE
-- =====================================================
CREATE TABLE gate_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    leave_application_id INT NULL,
    action_type VARCHAR(20) NOT NULL, -- EXIT, ENTRY
    scanned_by INT NOT NULL, -- Watchman user_id
    scan_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    qr_code_data TEXT,
    validation_status VARCHAR(50) NOT NULL, -- VALID, INVALID, EXPIRED, UNAUTHORIZED
    validation_message TEXT,
    location VARCHAR(100),
    INDEX idx_student_timestamp (student_id, scan_timestamp),
    INDEX idx_leave_application (leave_application_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_application_id) REFERENCES leave_applications(id) ON DELETE SET NULL,
    FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    notification_type VARCHAR(50) NOT NULL, -- LEAVE_APPLIED, LEAVE_APPROVED, LEAVE_REJECTED, EXTENSION_REQUEST, etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_leave_id INT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_leave_id) REFERENCES leave_applications(id) ON DELETE SET NULL,
    INDEX idx_user_unread (user_id, is_read, created_at)
);

-- =====================================================
-- SYSTEM SETTINGS TABLE
-- =====================================================
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('MAX_REGULAR_LEAVE_DAYS', '15', 'Maximum days for regular leave without principal approval'),
('QR_CODE_VALIDITY_HOURS', '2', 'Hours before leave starts when QR code becomes valid'),
('OTP_EXPIRY_MINUTES', '10', 'OTP expiry time in minutes'),
('MIN_ADVANCE_DAYS', '2', 'Minimum advance days required for leave application');

-- =====================================================
-- AUDIT LOG TABLE
-- =====================================================
CREATE TABLE audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(50),
    record_id INT,
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_action (user_id, action, created_at)
);

-- =====================================================
-- SAMPLE DATA FOR TESTING
-- =====================================================

-- Insert Deputy Warden
INSERT INTO users (role_id, email, phone_number, password_hash, is_verified, is_active) 
VALUES (3, 'deputywarden@college.edu', '+919876543210', '$2b$10$rJZhWzHyW6tQqN9kF9J8T.xMKxMKxMKxMKxMKxMKxMKxMKxMKxMKx', TRUE, TRUE);

INSERT INTO staff (user_id, staff_name, employee_id, designation, department)
VALUES (1, 'Dr. Rajesh Kumar', 'EMP001', 'Deputy Warden', 'Administration');

-- Insert Principal
INSERT INTO users (role_id, email, phone_number, password_hash, is_verified, is_active) 
VALUES (4, 'principal@college.edu', '+919876543211', '$2b$10$rJZhWzHyW6tQqN9kF9J8T.xMKxMKxMKxMKxMKxMKxMKxMKxMKxMKx', TRUE, TRUE);

INSERT INTO staff (user_id, staff_name, employee_id, designation, department)
VALUES (2, 'Dr. Lakshmi Narayan', 'EMP002', 'Principal', 'Administration');

-- Insert Watchman
INSERT INTO users (role_id, email, phone_number, password_hash, is_verified, is_active) 
VALUES (5, 'watchman@college.edu', '+919876543212', '$2b$10$rJZhWzHyW6tQqN9kF9J8T.xMKxMKxMKxMKxMKxMKxMKxMKxMKxMKx', TRUE, TRUE);

INSERT INTO staff (user_id, staff_name, employee_id, designation, department)
VALUES (3, 'Murugan', 'WATCH001', 'Security Guard', 'Security');

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

CREATE VIEW v_student_leave_summary AS
SELECT 
    s.college_id,
    s.student_name,
    s.department,
    COUNT(la.id) as total_leaves,
    SUM(CASE WHEN la.status = 'APPROVED_DW' OR la.status = 'APPROVED_PRINCIPAL' THEN 1 ELSE 0 END) as approved_leaves,
    SUM(CASE WHEN la.status = 'PENDING' THEN 1 ELSE 0 END) as pending_leaves,
    SUM(CASE WHEN la.status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_leaves
FROM students s
LEFT JOIN leave_applications la ON s.id = la.student_id
GROUP BY s.id, s.college_id, s.student_name, s.department;

CREATE VIEW v_active_leaves AS
SELECT 
    la.id,
    s.college_id,
    s.student_name,
    s.department,
    la.from_date,
    la.to_date,
    la.reason,
    la.status,
    DATEDIFF(la.to_date, la.from_date) + 1 as duration_days
FROM leave_applications la
JOIN students s ON la.student_id = s.id
WHERE la.status IN ('APPROVED_DW', 'APPROVED_PRINCIPAL')
AND CURDATE() BETWEEN la.from_date AND la.to_date;

-- =====================================================
-- STORED PROCEDURES
-- =====================================================

DELIMITER //

-- Procedure to activate student account after parent verification
CREATE PROCEDURE sp_activate_student_account(IN p_student_id INT)
BEGIN
    DECLARE v_parent_verified BOOLEAN;
    DECLARE v_student_user_id INT;
    
    -- Get student's user_id
    SELECT user_id INTO v_student_user_id FROM students WHERE id = p_student_id;
    
    -- Check if parent is verified
    SELECT u.is_verified INTO v_parent_verified
    FROM students s
    JOIN users u ON s.parent_id = u.id
    WHERE s.id = p_student_id;
    
    -- Activate student account if parent is verified
    IF v_parent_verified = TRUE THEN
        UPDATE users 
        SET is_active = TRUE, is_verified = TRUE
        WHERE id = v_student_user_id;
        
        -- Log the activation
        INSERT INTO audit_logs (user_id, action, table_name, record_id)
        VALUES (v_student_user_id, 'STUDENT_ACTIVATED', 'users', v_student_user_id);
    END IF;
END //

-- Procedure to check leave eligibility
CREATE PROCEDURE sp_check_leave_eligibility(
    IN p_student_id INT,
    IN p_from_date DATE,
    IN p_to_date DATE,
    OUT p_eligible BOOLEAN,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_overlapping_count INT;
    DECLARE v_student_active BOOLEAN;
    
    -- Check if student is active
    SELECT u.is_active INTO v_student_active
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = p_student_id;
    
    IF v_student_active = FALSE THEN
        SET p_eligible = FALSE;
        SET p_message = 'Student account not activated. Parent verification pending.';
    ELSE
        -- Check for overlapping leaves
        SELECT COUNT(*) INTO v_overlapping_count
        FROM leave_applications
        WHERE student_id = p_student_id
        AND status IN ('PENDING', 'APPROVED_DW', 'APPROVED_PRINCIPAL')
        AND (
            (p_from_date BETWEEN from_date AND to_date)
            OR (p_to_date BETWEEN from_date AND to_date)
            OR (from_date BETWEEN p_from_date AND p_to_date)
        );
        
        IF v_overlapping_count > 0 THEN
            SET p_eligible = FALSE;
            SET p_message = 'Overlapping leave application exists.';
        ELSE
            SET p_eligible = TRUE;
            SET p_message = 'Eligible to apply for leave.';
        END IF;
    END IF;
END //

DELIMITER ;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_role_active ON users(role_id, is_active);
CREATE INDEX idx_students_college_id ON students(college_id);
CREATE INDEX idx_students_parent ON students(parent_id);
CREATE INDEX idx_leave_dates ON leave_applications(from_date, to_date);

-- =====================================================
-- END OF SCHEMA
-- =====================================================