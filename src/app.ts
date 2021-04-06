import express from "express";
import { json } from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import axios from "axios";
import { OrderDetails } from "./interfaces/order-details";

const app = express();
const stripe = new Stripe(process.env.STRIPE_PRIVATE_API_KEY!, {
    apiVersion: "2020-08-27",
    typescript: true
});
const PORT = 3000 || process.env.PORT;
const ONTAX = 1.13;
const VILLETTA_LAT = '43.8022297';
const VILLETTA_LNG = '-79.53088099999999';

let result = dotenv.config();

if(result.error) {
    console.log(result.error);
}

app.use(cors())
app.use(json());

app.post('/charge', async (req, res, next) => {
    const order = req.body as OrderDetails;

    const formattedAddress = order.address.replace(' ', '+');
    const location = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${formattedAddress}+ON+Canada&key=${process.env.GOOGLE_API_KEY}`);

    if(location.data.status == 'OVER_QUERY_LIMIT') {
        return res.status(500).json({'message': 'Too Many Requests'});
    }

    const province = location.data.results[0].address_components.find((el: any) => el.types[0] == 'administrative_area_level_1');

    if(province.short_name != 'ON') {
        return res.status(401).json({'message': 'Address out of resturants bounds'});
    }

    if(location.data.status == 'ZERO_RESULTS') {
        return res.status(401).json({'message': 'Address Not Found'});
    }

    const lat = location.data.results[0].geometry.location.lat;
    const lng = location.data.results[0].geometry.location.lng;

    const etaInfo = await axios.get(`https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${VILLETTA_LAT},${VILLETTA_LNG}&destinations=${lat},${lng}&key=${process.env.GOOGLE_API_KEY}`);

    const distance = etaInfo.data.rows[0].elements[0].distance.value;
    const duration = etaInfo.data.rows[0].elements[0].duration.value;

    if(distance > 10000 && !order.pickup) {
        return res.status(401).json({'message': 'Address out of delivery bounds'});
    }

    const eta = (duration / 60 + 30).toFixed(0);

    const tipCharge = (order.total * (order.tip / 100 + 1)) - order.total;
    const success = await stripe.charges.create({
        amount: (order.total * ONTAX + tipCharge) * 100,
        currency: "cad",
        description: `Food Order from Villetta. Tip: ${tipCharge.toFixed(2)}`,
        source: order.tokenId
    });

    if(success) {
        return res.status(201).json({'message': 'order created', eta});
    } else {
        return res.status(401).json({'message': 'An error occurred'});
    }
});

app.listen(PORT, () => {
    console.log(`Payment Server Started!\nPORT: ${PORT} \nENVIRONMENT: ${process.env.NODE_ENV}`);
});