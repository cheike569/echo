import express from 'express';
class ExpressServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(express.json());
        this.app.get('/ping', (req, res) => {
            res.send('Pong');
        });
    }
    spinUp(twilioStatusCallback) {
        this.app.post('/status', (req, res) => {
            const body = req.body;
            twilioStatusCallback(body);
            res.send('OK');
        });
        this.server = this.app.listen(this.port, () => {
            // return console.log(`Express is listening at http://localhost:${this.port}`);
        });
        return this.server;
    }
    shutDown() {
        this.server.close();
    }
}
export default ExpressServer;
//# sourceMappingURL=express.js.map