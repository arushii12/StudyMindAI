import { getAuthenticatedUserFromRequest } from "../services/authService.js";

export async function authenticateUser(req, res, next) {
  try {
    req.user = await getAuthenticatedUserFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
}

export const attachCurrentUser = authenticateUser;
