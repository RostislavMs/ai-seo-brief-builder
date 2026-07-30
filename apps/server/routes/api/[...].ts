import { fromWebHandler } from "h3";
import { app } from "../../src/app";

/**
 * Точка зшивання Nitro та Hono: усе, що приходить на /api/**,
 * передається у Hono як стандартний Web Request.
 */
export default fromWebHandler(async (request) => app.fetch(request));
