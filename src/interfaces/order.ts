interface Dish {
    id: number;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    courseType: string;
    isSpecial: boolean;
}

interface Item {
    product: Dish;
    quantity: number;
}

export interface Order {
    items: Item[];
    firstname: string;
    lastname: string;
    email: string;
    address: string;
    phone: string;
    pickup: boolean;
    tip: number;
    eta: string;
    quantity: number;
    uniqueQuantity: number;
    total: number; 
    tokenId: string;
  }