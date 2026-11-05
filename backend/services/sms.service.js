import axios from 'axios';
import bcrypt from 'bcryptjs';

const generateOTP = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

const hashOTP = async (otp) => {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  return bcrypt.hash(otp, rounds);
};

const verifyOTP = async (plain, hashed) => {
  return bcrypt.compare(plain, hashed);
};

const sendOTP = async (mobile, otp) => {
  const isMock = process.env.SMS_MOCK_MODE === 'true' || process.env.NODE_ENV !== 'production';

  if (isMock) {
    console.log(`\n📱 [SMS MOCK] Mobile: ${mobile} | OTP: ${otp}\n`);
    return { success: true, messageId: `MOCK-${Date.now()}`, mock: true };
  }

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
    return { success: false, error: err.message };
  }
};

export { generateOTP, hashOTP, verifyOTP, sendOTP };
