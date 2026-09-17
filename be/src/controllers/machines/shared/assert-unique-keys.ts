import { HttpError } from 'src/api/errors/HttpError';
import { type EnvVarInput } from 'src/types/env-sets';
import { findDuplicate } from 'src/utils/general';

export function assertUniqueKeys(vars: EnvVarInput[]): void {
	const duplicate = findDuplicate(vars.map((envVar) => envVar.key));

	if (duplicate !== null) {
		throw new HttpError(400, `duplicate key ${duplicate}`);
	}
}
