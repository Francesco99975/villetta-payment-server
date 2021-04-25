
import { Router } from "express";
import { login, change } from "../controllers/auth";

const router = Router();

router
.post('/login', login)
// .post('/signup', signUp)
.post('/change', change)
// .get('/reset', reset);

export default router;