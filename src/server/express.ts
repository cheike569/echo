import express from 'express';
import { Server } from 'http';

class ExpressServer {
    private app = express();
    private port = process.env.PORT || 3000;
    public server: Server;

    constructor() {
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(express.json());

        this.app.get('/ping', (req, res) => {
            res.send('Pong');
        });
    }

    public spinUp(twilioStatusCallback: any): Server {
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

    public shutDown(): void {
        this.server.close();
    }
}

export default ExpressServer;