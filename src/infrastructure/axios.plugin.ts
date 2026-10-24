import type { HttpConfig, HttpPlugin, HttpRegistrationEntry, IAppBuilder, IConfigurationService, IXenoApplication, Optional, RequestContext, SetupAction, XenoRegistry } from "@xeno-js/core"
import { definePlugin, Guards, TOKENS, withCustomHttp } from "@xeno-js/core"

import type { AxiosConfig } from "./config/axios.config";
import type { ResiliencePolicy } from "./config/resilince.config";
import { NodeAxiosFactory } from "./factories/axios.factory";
import { CockatielResilienceFactory } from "./factories/cockatiel-resilience.factory";

export interface AxiosPluginConfig {
    name?: string
    axios: AxiosConfig
    resilience?: ResiliencePolicy
}

/**
 * @description Generic plugin to register any custom authentication implementation into Xeno.JS.
 * It delegates the registration to the Core AuthModule.
 *
 * @param configurator Either the AuthModuleOptions object or a factory receiving the configuration service.
 * @returns A XenoPlugin ready to be passed to builder.addAuth(...)
 *
 * @author Xeno
 * @version 1.0.0
 * @since 2025-09-30
 * @link https://github.com/xeno-js/xeno-js
 */
export const withAxiosHttp = <TRegistry extends XenoRegistry = XenoRegistry>(
    setup: SetupAction<AxiosPluginConfig[], IConfigurationService>
): HttpPlugin<TRegistry> => {
    return definePlugin('http', (builder: IAppBuilder<TRegistry, IXenoApplication<TRegistry>>, config: IConfigurationService) => {
        const pluginConfig: AxiosPluginConfig[] = []
        const clients: HttpRegistrationEntry<TRegistry>[] = []

        const ctxAccessor = (): Optional<RequestContext> => {
            try {
                    const accessor = builder.resolve(TOKENS.CONTEXT_ACCESSOR)
                    return accessor.getContext()
            } catch {
                /* noop */
            }
            return undefined
        }

        setup(pluginConfig, config)
        for (const clientConfig of pluginConfig) {
            const resilience = Guards.isDefined(clientConfig.resilience) ? () => new CockatielResilienceFactory().create(clientConfig.resilience!) : undefined
            const client: HttpRegistrationEntry<TRegistry> = {
                name: clientConfig.name,
                client: () => new NodeAxiosFactory().create({ ...clientConfig.axios, ctxAccessor }),
                resilience
            }
            clients.push(client)
        }

        const options: HttpConfig<TRegistry> = {
            clients
        }

        withCustomHttp<TRegistry>(options)(builder, config)
    })
}
