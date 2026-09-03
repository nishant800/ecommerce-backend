import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { seedDefaultCatalog } from "./scripts/seedDefaultCatalog.js";
import {
    seedPolicies,
} from "./scripts/seedPolicies.js";

const start = async () => {
    await connectDatabase();
    await seedDefaultCatalog();
    await seedPolicies();
    const PORT = Number(env.PORT);

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
};

start();
