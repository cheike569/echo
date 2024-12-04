export default function (phoneNumber) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
}
//# sourceMappingURL=validatePhoneNumber.js.map