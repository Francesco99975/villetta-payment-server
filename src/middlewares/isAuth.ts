 
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { HttpException } from "../interfaces/error";

export default (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.get("Authorization");
    if (!authHeader) {
      throw new HttpException(401, "Auth Header not found!");
    }
    const token = authHeader.split(" ")[1];
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
      if (!decodedToken) {
        throw new HttpException(401, "Not authenticated!");
      }
      res.locals = { isAuth: true, user: decodedToken };
      return next();
    } catch (error) {
      error.statusCode = 500;
      throw error;
    }
  };