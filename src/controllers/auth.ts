import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { HttpException } from "../interfaces/error";
import { LoginAccountCredentials } from "../interfaces/loginAccountCredentials";
import User from "../models/user";
import mailer from "@sendgrid/mail";
 
mailer.setApiKey( process.env.SENDGRID_API_KEY!);

// const signUp = async (req: Request, res: Response, next: NextFunction) => {
//     const {username, password} = req.body as LoginAccountCredentials;
    
//     try {
//         const existingUser= await User.findOne({username: username});
//         if(existingUser) {
//             throw new HttpException(401 ,"This username was already taken.");
//         }
//         const hashedpassword = await bcrypt.hash(password, 12);
//         const newUser = await new User({username, password: hashedpassword}).save();
//         return res.status(201).json({message: "User Account, successfully created!", UserId: newUser._id.toString()});
//     } catch (error) {
//         return next(error);
//     }
// };

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

const change = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { oldPassword, newPassword, id } = req.body;

        const user = await User.findById(id);

        if (!user) {
            throw new HttpException(404, "User not Found");
        }
        const authorized = await bcrypt.compare(oldPassword, user.get('password'));
        if (!authorized) {
            throw new HttpException(401, "Wrong Password");
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        user.set('password', hashedPassword);
        await user.save();
        mailer.send({
            to: "francescomich@ymail.com",
            from: "francescobarranca@outlook.com",
            subject: "Password Change Successful",
            html: `
                <h1>Your password was changed successfully</h1>
            `,
        });
        return res.status(200).json({'message': 'Password Change Successful'});
    } catch (error) {
        return next(error);
    }
}

// const reset = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const user = await User.findOne();

//         if (!user) {
//             throw new HttpException(404, "User not Found");
//         }
    
//         const newPassword = generatePasswordV2(10, 1, 1, 1, 1);

//         const hashedPassword = await bcrypt.hash(newPassword, 12);

//         user.set('password', hashedPassword);
//         await user.save();
//         mailer.sendMail({
//             to: "francescomich@ymail.com",
//             from: "francescobarranca@outlook.com",
//             subject: "Password Reset Successful",
//             html: `
//                 <h1>Your password was resetted successfully</h1>
//                 <h2>Your new password is: ${newPassword}</h2>
//             `,
//         });
//         return res.status(200).json({'message': 'Password Reset Successful'});
//     } catch (error) {
//         return next(error);
//     }
// }

export { login, change }; 