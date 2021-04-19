import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { HttpException } from "../interfaces/error";
import { LoginAccountCredentials } from "../interfaces/loginAccountCredentials";
import User from "../models/user";

const signUp = async (req: Request, res: Response, next: NextFunction) => {
    const {username, password} = req.body as LoginAccountCredentials;
    
    try {
        const existingUser= await User.findOne({username: username});
        if(existingUser) {
            throw new HttpException(401 ,"This username was already taken.");
        }
        const hashedpassword = await bcrypt.hash(password, 12);
        const newUser = await new User({username, password: hashedpassword}).save();
        return res.status(201).json({message: "User Account, successfully created!", UserId: newUser._id.toString()});
    } catch (error) {
        return next(error);
    }
};

const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
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
            {expiresIn: '24h'}
        );

        return res.status(200).json({ token, userId: user._id.toString() });
    } catch (error) {
        return next(error);
    }
}

export { login, signUp }; 