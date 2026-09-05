import { buildServer } from 'src/api/build-server';

buildServer().then((server) => {
	return server.listen({
		port: Number(process.env.PORT ?? 1506),
		host: process.env.HOST ?? '127.0.0.1'
	});
});
