import axios from 'axios';
import bcrypt from 'bcryptjs';

/**
 * Generate a cryptographically random 6-digit OTP.
 */
const generateOTP = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

/**
 * Hash an OTP using bcrypt.
 */
const hashOTP = async (otp) => {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  return bcrypt.hash(otp, rounds);
};

/**
 * Compare plain OTP with hashed version.
 */
const verifyOTP = async (plain, hashed) => {
  return bcrypt.compare(plain, hashed);
};

/**
 * Send OTP via Fast2SMS (or mock in development).
 * Returns { success, messageId? }
 */
const sendOTP = async (mobile, otp) => {
  const isMock = process.env.SMS_MOCK_MODE === 'true' || process.env.NODE_ENV !== 'production';

  if (isMock) {
    // Log OTP to console for development convenience
    console.log(`\n📱 [SMS MOCK] Mobile: ${mobile} | OTP: ${otp}\n`);
    return { success: true, messageId: `MOCK-${Date.now()}`, mock: true };
  }

  // Production: Fast2SMS
  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        variables_values: otp,
        route: 'otp',
        numbers: mobile,
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.return === true) {
      return { success: true, messageId: response.data.request_id };
    }

    console.error('Fast2SMS error response:', response.data);
    return { success: false, error: response.data?.message || 'SMS delivery failed' };
  } catch (err) {
    console.error('Fast2SMS request error:', err.message);
    // Fail gracefully — don't block OTP flow if SMS fails
    return { success: false, error: err.message };
  }
};

export { generateOTP, hashOTP, verifyOTP, sendOTP };
