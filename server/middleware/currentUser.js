// Import the auth service function that reads JWT/cookie data and returns the current user.
import { getAuthenticatedUserFromRequest } from "../services/authService.js";

// This runs before protected controllers.
// If the token is valid, the controller receives req.user.
export async function authenticateUser(req, res, next) {
  try {
    req.user = await getAuthenticatedUserFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
}

export const attachCurrentUser = authenticateUser;
