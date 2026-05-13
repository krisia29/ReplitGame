import { Router } from "express";
import { PAINT_OPTIONS, WRAP_OPTIONS, WHEEL_OPTIONS, TUNE_OPTIONS } from "../data/catalog";

const router = Router();

router.get("/customizations/paints", (_req, res) => {
  res.json(PAINT_OPTIONS);
});

router.get("/customizations/wraps", (_req, res) => {
  res.json(WRAP_OPTIONS);
});

router.get("/customizations/wheels", (_req, res) => {
  res.json(WHEEL_OPTIONS);
});

router.get("/customizations/tunes", (_req, res) => {
  res.json(TUNE_OPTIONS);
});

export default router;
