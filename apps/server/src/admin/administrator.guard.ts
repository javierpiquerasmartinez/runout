import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import {
  IdentityService,
  type Identity,
} from '../identity/identity.service.js';

type AdminRequest = {
  headers: Record<string, string | string[] | undefined>;
  administrator?: Identity;
};

/**
 * Lets a request through only for an Administrator (ADR 0008), keeping who
 * they are for `@Administrator()`. Put on the whole panel's controller, so
 * no endpoint added to it can forget the check.
 */
@Injectable()
export class AdministratorGuard implements CanActivate {
  constructor(private readonly identities: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers.authorization;
    request.administrator = await this.identities.authenticateAdministrator(
      bearerToken(
        typeof authorization === 'string' ? authorization : undefined,
      ),
    );
    return true;
  }
}

/** The Administrator `AdministratorGuard` let through. */
export const Administrator = createParamDecorator(
  (_: unknown, context: ExecutionContext): Identity => {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (!request.administrator) {
      throw new Error('@Administrator() needs AdministratorGuard');
    }
    return request.administrator;
  },
);
