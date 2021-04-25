interface Dish {
    id: number;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    courseType: string;
    isSpecial: boolean;
}

export interface Item {
    product: Dish;
    quantity: number;
}

export interface OrderDetails {
    items: Item[];
    firstname: string;
    lastname: string;
    email: string;
    address: string;
    phone: string;
    pickup: boolean;
    tip: number;
    method: string;
    homeDeliveryCost: number;
    orderPreparationTime: number;
    quantity: number;
    uniqueQuantity: number;
    total: number; 
    tokenId: string;
  }