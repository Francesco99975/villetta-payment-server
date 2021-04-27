import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { json } from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import axios from "axios";
import mongoose from "mongoose";
import { OrderDetails } from "./interfaces/order-details";
import { HttpException } from "./interfaces/error";
import authRouter from "./routes/auth"
import Order from "./models/order";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import sendgridTransport from "nodemailer-sendgrid-transport";
import readableSeconds from "readable-seconds";
import isAuth from "./middlewares/isAuth";
import User from "./models/user";
import bcrypt from "bcrypt";
import { generatePasswordV2 } from "./models/passwordGenerator";

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

const whitelist = [
    'http://localhost:4201',
    'http://localhost:4200',
    'http://localhost', 
    'https://localhost', 
    'http://localhost:81',
    'https://localhost:81',
    'http://192.168.0.38',
    'http://192.168.0.38:80', 
    'http://192.168.0.38:81',
    // 'http://villetta-app', 
    // 'https://villetta-app',
    // 'http://villetta-orders-app', 
    // 'https://villetta-orders-app'
]

const mailer = nodemailer.createTransport(sendgridTransport({
    auth: {
        api_key: process.env.SENDGRID_API_KEY!
    }
}));

const stripe = new Stripe(process.env.STRIPE_PRIVATE_API_KEY!, {
    apiVersion: "2020-08-27",
    typescript: true
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        credentials: true,
        origin: function (origin: any, callback) {
            if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
            } else {
            callback(new Error('Not allowed by CORS'))
            }
        }
    }
});

io.on('connection', (socket) => {
    console.log(`A connection as been created with: ${socket.id}`);

    socket.on('disconnect', () => { 
        socket.removeAllListeners('create');
        socket.removeAllListeners('disconnect');
        io.removeAllListeners('connection');
        console.log(`${socket.id} Disconnected!`);
    });
});


app.use(cors({
    origin: function (origin: any, callback) {
                if (whitelist.indexOf(origin) !== -1 || !origin) {
                callback(null, true)
                } else {
                callback(new Error('Not allowed by CORS'))
                }
            }
}));
app.use(json());

app.get('/', (req, res, next) => {
    return res.json({'message': "Welcome to the payment server"});
});

app.get('/orders', isAuth, async (req, res, next) => {
    try {
        const orders = await Order.find();
        return res.status(200).json({orders});
    } catch (error) {
        return next(error);
    }
});

app.put('/order/:id', isAuth, async (req, res, next) => {
    const id = req.params.id;
    const status = req.body.status;

    try {
        const order = await Order.findById(id);
        if(!order) {
            throw new HttpException(404, "Could not find any order with this id");
        }
        order.set('fulfilled', status);
        await order.save();
        return res.status(201).json({message: 'order status updated', id});
    } catch (error) {
        return next(error);
    }
});

app.use('/auth', authRouter);

app.post('/charge', async (req, res, next) => {
    try {
        const order = req.body as OrderDetails;

        let eta: number;
        let etaDesc: string;

        if(!order.pickup) {
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

            if(distance > 20000 && !order.pickup) {
                return res.status(401).json({'message': 'Address out of delivery bounds'});
            }

            eta = duration + (+order.orderPreparationTime * 60);
            etaDesc = readableSeconds(eta);

            if(etaDesc.includes('seconds')) {
                etaDesc = etaDesc.substring(0, etaDesc.indexOf('and')).trim();
            }
        } else {
            eta = +order.orderPreparationTime * 60;
            etaDesc = `${order.orderPreparationTime} minutes`;
        }

        //Calculate Amount to Pay
        let amt: number;
        let tipCharge: number;
        if(order.pickup) {
            tipCharge = ((order.total * ONTAX) * (order.tip / 100 + 1)) - (order.total * ONTAX);
            amt = +((order.total * ONTAX + tipCharge) * 100).toFixed(0);
        } else {
            tipCharge = (((order.total + (+order.homeDeliveryCost)) * ONTAX) * (order.tip / 100 + 1)) - ((order.total + (+order.homeDeliveryCost)) * ONTAX);
            amt = +((((order.total + (+order.homeDeliveryCost)) * ONTAX) + tipCharge) * 100).toFixed(0);
        }

        let success;
        if(order.method === 's') {
            success = await stripe.charges.create({
                amount: amt,
                currency: "cad",
                description: `Food Order from Villetta (${order.pickup ? 'P' : 'D'}). Tip: $${tipCharge.toFixed(2)} (${order.tip}%)`,
                source: order.tokenId
            });
        }

        if(success || order.method === 'c') {
            const newOrder = await new Order({
                clientname: order.firstname + ' ' + order.lastname,
                items: order.items,
                email: order.email,
                address: order.address,
                phone: order.phone,
                pickup: order.pickup,
                deliveryFees: order.pickup ? 0.0 : +order.homeDeliveryCost,
                tip: order.tip,
                method: order.method,
                eta,
                fulfilled: false
            }).save();

            const invoice = new PDFDocument();

            const hst: number = order.pickup ? (order.total * ONTAX) - order.total :
            ((order.total + (+order.homeDeliveryCost)) * ONTAX - (order.total + (+order.homeDeliveryCost)));

            invoice.pipe(fs.createWriteStream(path.join(__dirname, 'invoices/invoice.pdf')));

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
            invoice.fontSize(16).text(`HST: $${hst.toFixed(2)}`);
            invoice.fontSize(20).text(`Total: $${(amt / 100).toFixed(2)}`);
            invoice.end();

            mailer.sendMail({
                to: order.email,
                from: "francescobarranca@outlook.com",
                subject: "Villetta Order Invoice",
                html: `
                    <h1>Thank you for choosing us!</h1>
                    <h3>Delivery Fee: $${!order.pickup ? (+order.homeDeliveryCost).toFixed(2) : '0.00'}</h3>
                    <h3>HST: $${hst.toFixed(2)}</h3>
                    <h3>Tip : $${tipCharge.toFixed(2)} (${order.tip}%)</h3>
                    <h3>Total: $${(amt / 100).toFixed(2)}</h3>
                `,
                attachments: [
                    {
                        filename: "invoice.pdf",  
                        path: path.join(__dirname, 'invoices/invoice.pdf')
                    }
                ]
            }).then(() => console.log("Invoice Sent to client")).catch((err) => {
                console.log("Invoice Mail Error");
                console.log(err);
            });

            io.sockets.emit('create', newOrder);

            return res.status(201).json({'message': 'order created', eta: etaDesc, pickup: order.pickup});
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
    .then(async () => {
        const users = await User.find();
        if(!users || users.length <= 0) {
            const password = generatePasswordV2(10, 1, 1, 1, 1);
            // const password = "password";
            const hash = await bcrypt.hash(password, 12);
            await new User({username: 'resadmin', password: hash}).save();

            mailer.sendMail({
                to: "francescomich99@gmail.com",
                from: "francescobarranca@outlook.com",
                subject: "Automatic Password Reset",
                html: `
                    <h1>Your password was changed by your mantainer or automated system</h1>
                    <h2>Your new password is: ${password}</h2>
                `,
            }).then((result) => {
                console.log("Mail Sent");
                console.log(result);
            }).catch((err) => {
                console.log("Mail Error");
                console.log(process.env.SENDGRID_API_KEY);
                console.log(err);
            });
        }
        server.listen(PORT, () => {
            console.log(`Payment Server Started!\nPORT: ${PORT} \nENVIRONMENT: ${process.env.NODE_ENV}`);
        });
        
    })
    .catch((err) => {
        console.log("DB ERROR!!!");
        console.log(process.env.MONGO_URI);
        console.log(err); 
    });