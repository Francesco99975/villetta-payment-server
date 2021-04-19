
import { Router } from "express";
import { login, signUp } from "../controllers/auth";

const router = Router();

router
.post('/login', login)
.post('/signup', signUp)
// .post('/reset', resetPassword)
// .post('/confirm', confirmReset);

export default router;