import express from "express";
import { json } from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { Order } from "./interfaces/order";

const app = express();
const stripe = new Stripe(process.env.STRIPE_PRIVATE_API_KEY!, {
    apiVersion: "2020-08-27",
    typescript: true
});
const PORT = 3000 || process.env.PORT;
const ONTAX = 1.13;

let result = dotenv.config();

if(result.error) {
    console.log(result.error);
}

app.use(cors())
app.use(json());

app.post('/charge', async (req, res, next) => {
    const order = req.body as Order;
    const tipCharge = (order.total * (order.tip / 100 + 1)) - order.total;
    const success = await stripe.charges.create({
        amount: (order.total * ONTAX + tipCharge) * 100,
        currency: "cad",
        description: `Food Order from Villetta. Tip: ${tipCharge.toFixed(2)}`,
        source: order.tokenId
    });

    if(success) {
        return res.status(201).json({'message': 'order created'});
    } else {
        return res.status(401).json({'message': 'An error occurred'});
    }
});

app.listen(PORT, () => {
    console.log(`Payment Server Started!\nPORT: ${PORT} \nENVIRONMENT: ${process.env.NODE_ENV}`);
});