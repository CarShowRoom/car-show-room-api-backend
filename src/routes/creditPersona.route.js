import { Router } from "express";
import {
  createCreditPerson,
  getAllCreditPersons,
  getCreditPersonById,
} from "../controllers/creditPersona.controller.js";

const router = Router();

router.post("/credit-persona", createCreditPerson);
router.get("/credit-persona", getAllCreditPersons);
router.get("/credit-persona/:id", getCreditPersonById);

export default router;
