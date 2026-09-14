import { buildServer } from 'src/api/build-server';

buildServer().then((server) => {
	return server.listen({
		port: Number(server.env.PORT ?? 1606),
		host: server.env.HOST ?? '127.0.0.1'
	});
});
