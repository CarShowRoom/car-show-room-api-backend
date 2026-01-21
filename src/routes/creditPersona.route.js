import { Router } from "express";
import {
  createCreditPerson,
  getAllCreditPersons,
  getCreditPersonById,
  updateCreditPerson,
} from "../controllers/creditPersona.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

const router = Router();

router.post(
  "/credit-persona",
  protect,
  permissionGranted("owner", "admin"),
  createCreditPerson
);
router.get(
  "/credit-persona",
  protect,
  permissionGranted("owner", "admin"),
  getAllCreditPersons
);
router.get(
  "/credit-persona/:id",
  protect,
  permissionGranted("owner", "admin"),
  getCreditPersonById
);
router.patch(
  "/credit-persona/:id",
  protect,
  permissionGranted("owner"),
  updateCreditPerson
);
export default router;
