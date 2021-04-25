

function genRandomLower() {
    let array = "a b c d e f g h j k m n p q r s t u v w x y z".split(' ');
    return array[Math.floor(Math.random() * array.length)];
}


function genRandomUpper(){
    let array = "A B C D E F G H J K M N P Q R S T U V W X Y Z".split(' ');
    return array[Math.floor(Math.random() * array.length)];
}


function genRandomNumber(){
    let array = "1 2 3 4 5 6 7 8 9".split(' ');
    return array[Math.floor(Math.random() * array.length)];
}


function genRandomSymbol(){
    let array = "~ ! @ # $ % ^ & * ( ) [ ] { } _ - = + ?".split(' ');
    return array[Math.floor(Math.random() * array.length)];
}


// let funcs = {
//     'lower': genRandomLower,
//     'upper': genRandomUpper,
//     'nums': genRandomNumber,
//     'sym': genRandomSymbol
// }

let randomFuncs = [genRandomLower, genRandomUpper,
               genRandomNumber, genRandomSymbol]


export function generatePasswordV2(size: number, lower: number, upper: number, nums: number, sym: number) {
    let generatedPassword = ""
    let funcCount = lower + upper + nums + sym;

    let conditions = [lower, upper, nums, sym];
    let rf: any = [];

    for (let i = 0; i < conditions.length; i++) {
       if(conditions[i] == 1) {
           rf.push(randomFuncs[i]);
       }
    }

    for (let index = 0; index < size; index++) {
        generatedPassword += rf[Math.floor(Math.random() * rf.length)]();
    }

    return generatedPassword
}