import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { HttpException } from "../interfaces/error";
import { LoginAccountCredentials } from "../interfaces/loginAccountCredentials";
import User from "../models/user";

const login = async (req: Request, res: Response, next: NextFunction) => {
    const { username, password } = req.body as LoginAccountCredentials;

    const user = await User.findOne({username: username});
    if(!user) {
        throw new HttpException(404,"Could not find user using these credentials");
    }
    const authorized = await bcrypt.compare(password, user.get('password'));
    if(!authorized) {
        throw new HttpException(401, "Could not access this account! Wrong Password...");
    }
    const token = jwt.sign(
        {username: user.get('username'), id: user._id.toString()}, 
        process.env.JWT_SECRET!, 
        {expiresIn: '1h'}
    );

    return res.status(200).json({ token, userId: user._id.toString() });
}

export { login }; 