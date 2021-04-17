import express from "express";
import fs from "fs";
import { json } from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import axios from "axios";
import mongoose from "mongoose";
import { OrderDetails } from "./interfaces/order-details";
import { HttpException } from "./interfaces/error";
import Order from "./models/order";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import sendgridTransport from "nodemailer-sendgrid-transport";

import readableSeconds from "readable-seconds";

const app = express();

let result = dotenv.config();

if(result.error) {
    console.log(result.error);
}

const PORT = 3000 || process.env.PORT;
// const MONGO_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.02l8p.azure.mongodb.net/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`;

const ONTAX = 1.13;
const VILLETTA_LAT = '43.8022297';
const VILLETTA_LNG = '-79.53088099999999';

const stripe = new Stripe(process.env.STRIPE_PRIVATE_API_KEY!, {
    apiVersion: "2020-08-27",
    typescript: true
});

const mailer = nodemailer.createTransport(
    sendgridTransport({
            auth: {
                api_key: process.env.SENDGRID_API_KEY,
            },
    }));

app.use(cors())
app.use(json());

app.get('/', (req, res, next) => {
    return res.json({'message': "Welcome to the payment server"});
});

app.post('/charge', async (req, res, next) => {
    try {
        const order = req.body as OrderDetails;

        const formattedAddress = order.address.replace(' ', '+');
        const location = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${formattedAddress}+ON+Canada&key=${process.env.GOOGLE_API_KEY}`);

        if(location.data.status == 'OVER_QUERY_LIMIT') {
            return res.status(500).json({'message': 'Too Many Requests'});
        }

        if(location.data.status == 'ZERO_RESULTS') {
            return res.status(401).json({'message': 'Address Not Found'});
        }

        const province = location.data.results[0].address_components.find((el: any) => el.types[0] == 'administrative_area_level_1');

        if(province.short_name != 'ON') {
            return res.status(401).json({'message': 'Address out of resturants bounds'});
        }

        const lat = location.data.results[0].geometry.location.lat;
        const lng = location.data.results[0].geometry.location.lng;

        const etaInfo = await axios.get(`https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${VILLETTA_LAT},${VILLETTA_LNG}&destinations=${lat},${lng}&key=${process.env.GOOGLE_API_KEY}`);

        const distance = etaInfo.data.rows[0].elements[0].distance.value;
        const duration = etaInfo.data.rows[0].elements[0].duration.value;

        if(distance > 10000 && !order.pickup) {
            return res.status(401).json({'message': 'Address out of delivery bounds'});
        }

        let eta: string;

        if(!order.pickup) {
            eta = readableSeconds(duration + (30 * 60), 2);

            if(eta.includes('seconds')) {
                eta = eta.substring(0, eta.indexOf('and')).trim();
            }
        } else {
            eta = `${order.orderPreparationTime} minutes`;
        }

        //Calculate Tip
        const tipCharge = (order.total * (order.tip / 100 + 1)) - order.total;

        //Calculate Amount to Pay
        let amt;
        if(order.pickup) {
            amt = +((order.total * ONTAX + tipCharge) * 100).toFixed(0);
        } else {
            amt = +(((order.total * ONTAX + (+order.homeDeliveryCost)) + tipCharge) * 100).toFixed(0);
        }

        const success = await stripe.charges.create({
            amount: amt,
            currency: "cad",
            description: `Food Order from Villetta (${order.pickup ? 'P' : 'D'}). Tip: $${tipCharge.toFixed(2)} (${order.tip}%)`,
            source: order.tokenId
        });

        if(success) {
            await new Order({
                clientname: order.firstname + ' ' + order.lastname,
                items: order.items,
                email: order.email,
                address: order.address,
                phone: order.phone,
                pickup: order.pickup,
                tip: order.tip.toString() + '%' + ` ($${tipCharge.toFixed(2)})`,
                eta
            }).save();

            const invoice = new PDFDocument();

            invoice.pipe(fs.createWriteStream('invoice.pdf'));

            invoice.fontSize(16).text("Invoice", { underline: true });
            invoice.text("---------------------------------------");

            order.items.forEach((item) => {
                invoice.text(
                `${item.product.name} - x${item.quantity} / $${(item.product.price * item.quantity).toFixed(2)} --- $${item.product.price} ea.`
                );
            });
            invoice.text("---------------------------------------");
            if(!order.pickup) invoice.fontSize(16).text(`Delivery Fee: $${(+order.homeDeliveryCost).toFixed(2)}`);
            invoice.fontSize(16).text(`Tip : $${tipCharge.toFixed(2)} (${order.tip}%)`);
            invoice.fontSize(16).text(`HST: $${(order.total * ONTAX - order.total).toFixed(2)}`);
            invoice.fontSize(20).text(`Total: $${(amt / 100).toFixed(2)}`);
            invoice.end();

            mailer.sendMail({
                to: order.email,
                from: "francescobarranca@outlook.com",
                subject: "Villetta Order Invoice",
                html: `<h1>Thank you for choosing us!</h1>`,
                attachments: [{filename: 'invoice.pdf', path: 'invoice.pdf'}]
            });

            return res.status(201).json({'message': 'order created', eta, pickup: order.pickup});
        } else {
            return res.status(401).json({'message': 'An error occurred'});
        }
    } catch (error) {
        next(error);
    }
});

app.use((req, res, next) => {
    return res.status(404).json({message: "Route not found"});
});

app.use((error: HttpException, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(error);
    return res.status(error.code || 500).json({message: error.message || "An error occurred on the server"});
});

mongoose.connect(process.env.MONGO_URI!, { useNewUrlParser: true, useUnifiedTopology: true})
    .then(() => 
        app.listen(PORT, () => {
            console.log(`Payment Server Started!\nPORT: ${PORT} \nENVIRONMENT: ${process.env.NODE_ENV}`);
        })
    )
    .catch((err) => {
        console.log("DB ERROR!!!");
        console.log(process.env.MONGO_URI);
        console.log(err); 
    });