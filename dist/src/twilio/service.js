import twilio from 'twilio';
import validatePhoneNumber from "../helpers/validatePhoneNumber.js";
// @ts-ignore
export const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
export const makeCall = async (to, url, callbackUrl) => {
    if (!validatePhoneNumber(to)) {
        throw new Error(`The provided phone number '${to}' is not a valid phone number.`);
    }
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!validatePhoneNumber(from)) {
        throw new Error(`The provided phone number '${from}' is not a valid phone number.`);
    }
    return await twilioClient.calls.create({
        from,
        to,
        // url: url,
        twiml: `<Response>
    <Connect>
       <Stream url="${url}" />
   </Connect>
</Response>`,
        record: true,
        statusCallback: callbackUrl,
        timeLimit: process.env.MAX_CALL_LIFETIME_SECONDS,
    });
};
export const hangupCall = async (callSid) => {
    return await twilioClient.calls(callSid).update({
        status: 'completed'
    });
};
//# sourceMappingURL=service.js.map