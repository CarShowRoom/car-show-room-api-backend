import { Router } from "express";
import {
  createCreditPerson,
  getAllCreditPersons,
  getCreditPersonById,
  updateCreditPerson,
} from "../controllers/creditPersona.controller.js";

const router = Router();

router.post("/credit-persona", createCreditPerson);
router.get("/credit-persona", getAllCreditPersons);
router.get("/credit-persona/:id", getCreditPersonById);
router.patch("/credit-persona/:id", updateCreditPerson);
export default router;
