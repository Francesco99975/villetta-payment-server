import { Schema, model } from "mongoose";

const orderSchema = new Schema({
    clientname: {
        type: String,
        required: true
    },
    items: [{}],
    email: {
        type: String,
        required: true,
    },
    address: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    pickup: {
        type: Boolean,
        required: true
    },
    deliveryFees: {
        type: Number,
        required: true
    },
    tip: {
        type: Number,
        required: true
    },
    eta: {
        type: Number,
        required: true
    },
    fulfilled: {
        type: Boolean,
        required: true
    }
}, {timestamps: true});

export default model('Order', orderSchema);