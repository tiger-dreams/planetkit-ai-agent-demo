import { SignJWT } from 'jose';

// ⚠️ DEMO ONLY: Client-side token generation for demonstration purposes.
// In production, access tokens MUST be generated on your App Server.
// Exposing API Secret in client-side code is a security risk.
// See: https://docs.lineplanet.me for server-side token generation guide.
//
// Reference: https://docs.lineplanet.me/getting-started/essentials/access-token
export const generatePlanetKitToken = async (
  serviceId: string,
  apiKey: string,
  userId: string,
  roomId: string,
  _expirationTimeInSeconds: number = 3600, // Note: PlanetKit doesn't use exp field per docs
  apiSecret?: string
): Promise<string> => {
  try {
    const now = Math.floor(Date.now() / 1000);

    // API Secret is required
    if (!apiSecret) {
      throw new Error('API Secret is required for PlanetKit token generation');
    }

    // Use API Secret as the signing secret
    const secret = new TextEncoder().encode(apiSecret);

    // Use only the required fields from the PlanetKit official documentation
    // Adding extra fields increases token size, so they are disallowed
    // Note: fields like exp, nbf, room are intentionally excluded
    const payload = {
      sub: serviceId,  // Service ID
      uid: userId,     // User ID
      iss: apiKey,     // API Key
      iat: now         // Creation timestamp
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(secret);

    return token;
  } catch (error) {
    throw new Error(`Failed to generate PlanetKit token: ${error}`);
  }
};

// Validate token format
export const validateToken = (token: string): boolean => {
  try {
    // Simple JWT format validation
    const parts = token.split('.');
    return parts.length === 3;
  } catch {
    return false;
  }
};

// Get token expiration
export const getTokenExpiration = (token: string): Date | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    if (payload && payload.exp) {
      return new Date(payload.exp * 1000);
    }
    return null;
  } catch {
    return null;
  }
};