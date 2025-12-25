import express from "express";
import {
  signup,
  login,
  updatePassword,
  userSoftDelete,
  getAllAccounts,
  getAccountById,
  updateUser,
  userRestore,
  userDelete,
} from "../controllers/admin.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

router.post("/admin/signup", signup);
router.post("/admin/login", login);
router.get("/admin", getAllAccounts);
router.get("/admin/:accountId", getAccountById);
router.patch("/admin/:accountId", updateUser);
router.patch("/admin/update-password/:accountId", updatePassword);
router.patch("/admin/soft-delete/:accountId", userSoftDelete);
router.patch("/admin/restore/:accountId", userRestore);
router.delete("/admin/:accountId", userDelete);

export default router;
