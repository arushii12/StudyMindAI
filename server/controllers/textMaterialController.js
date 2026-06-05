import {
  generateFromTextForUser,
  getTextMaterialForUser,
  saveTextMaterialForUser
} from "../services/textMaterialService.js";

export async function saveTextMaterial(req, res, next) {
  try {
    const response = await saveTextMaterialForUser(req.user, req.body);
    res.status(req.body.documentId ? 200 : 201).json(response);
  } catch (error) {
    next(error);
  }
}

export async function getTextMaterial(req, res, next) {
  try {
    const response = await getTextMaterialForUser(req.user, req.params.id);
    res.json(response);
  } catch (error) {
    next(error);
  }
}

export async function generateFromText(req, res, next) {
  try {
    const response = await generateFromTextForUser(req.user, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}
