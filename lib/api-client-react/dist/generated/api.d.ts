import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { AcceptInvitationInput, AnalyticsSummary, AuthUser, EmployerTrend, ErrorResponse, ForgotPasswordInput, GetEmployerTrendsParams, GetRecentSearchesParams, GetTopLocationsParams, GetTopServicesParams, GetZeroResultSearchesParams, HealthStatus, HeatmapPoint, Invitation, InvitationInput, ListProvidersParams, ListServiceRequestsParams, LocationCount, LoginInput, Provider, ProviderInput, ProviderUpdate, ResetPasswordInput, SearchEvent, SearchEventInput, ServiceCategory, ServiceCategoryInput, ServiceCount, ServiceRequest, ServiceRequestInput, ServiceRequestUpdate, SuccessResponse, User, UserUpdate } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getLoginUrl: () => string;
/**
 * @summary Login with email and password
 */
export declare const login: (loginInput: LoginInput, options?: RequestInit) => Promise<AuthUser>;
export declare const getLoginMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export type LoginMutationResult = NonNullable<Awaited<ReturnType<typeof login>>>;
export type LoginMutationBody = BodyType<LoginInput>;
export type LoginMutationError = ErrorType<ErrorResponse>;
/**
* @summary Login with email and password
*/
export declare const useLogin: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export declare const getLogoutUrl: () => string;
/**
 * @summary Logout current user
 */
export declare const logout: (options?: RequestInit) => Promise<SuccessResponse>;
export declare const getLogoutMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
export type LogoutMutationResult = NonNullable<Awaited<ReturnType<typeof logout>>>;
export type LogoutMutationError = ErrorType<unknown>;
/**
* @summary Logout current user
*/
export declare const useLogout: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof logout>>, TError, void, TContext>;
export declare const getGetMeUrl: () => string;
/**
 * @summary Get current authenticated user
 */
export declare const getMe: (options?: RequestInit) => Promise<AuthUser>;
export declare const getGetMeQueryKey: () => readonly ["/api/auth/me"];
export declare const getGetMeQueryOptions: <TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMeQueryResult = NonNullable<Awaited<ReturnType<typeof getMe>>>;
export type GetMeQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get current authenticated user
 */
export declare function useGetMe<TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getForgotPasswordUrl: () => string;
/**
 * @summary Request password reset
 */
export declare const forgotPassword: (forgotPasswordInput: ForgotPasswordInput, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getForgotPasswordMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof forgotPassword>>, TError, {
        data: BodyType<ForgotPasswordInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof forgotPassword>>, TError, {
    data: BodyType<ForgotPasswordInput>;
}, TContext>;
export type ForgotPasswordMutationResult = NonNullable<Awaited<ReturnType<typeof forgotPassword>>>;
export type ForgotPasswordMutationBody = BodyType<ForgotPasswordInput>;
export type ForgotPasswordMutationError = ErrorType<unknown>;
/**
* @summary Request password reset
*/
export declare const useForgotPassword: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof forgotPassword>>, TError, {
        data: BodyType<ForgotPasswordInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof forgotPassword>>, TError, {
    data: BodyType<ForgotPasswordInput>;
}, TContext>;
export declare const getResetPasswordUrl: () => string;
/**
 * @summary Reset password with token
 */
export declare const resetPassword: (resetPasswordInput: ResetPasswordInput, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getResetPasswordMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof resetPassword>>, TError, {
        data: BodyType<ResetPasswordInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof resetPassword>>, TError, {
    data: BodyType<ResetPasswordInput>;
}, TContext>;
export type ResetPasswordMutationResult = NonNullable<Awaited<ReturnType<typeof resetPassword>>>;
export type ResetPasswordMutationBody = BodyType<ResetPasswordInput>;
export type ResetPasswordMutationError = ErrorType<unknown>;
/**
* @summary Reset password with token
*/
export declare const useResetPassword: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof resetPassword>>, TError, {
        data: BodyType<ResetPasswordInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof resetPassword>>, TError, {
    data: BodyType<ResetPasswordInput>;
}, TContext>;
export declare const getListProvidersUrl: (params?: ListProvidersParams) => string;
/**
 * @summary List all providers with optional filtering
 */
export declare const listProviders: (params?: ListProvidersParams, options?: RequestInit) => Promise<Provider[]>;
export declare const getListProvidersQueryKey: (params?: ListProvidersParams) => readonly ["/api/providers", ...ListProvidersParams[]];
export declare const getListProvidersQueryOptions: <TData = Awaited<ReturnType<typeof listProviders>>, TError = ErrorType<unknown>>(params?: ListProvidersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProvidersQueryResult = NonNullable<Awaited<ReturnType<typeof listProviders>>>;
export type ListProvidersQueryError = ErrorType<unknown>;
/**
 * @summary List all providers with optional filtering
 */
export declare function useListProviders<TData = Awaited<ReturnType<typeof listProviders>>, TError = ErrorType<unknown>>(params?: ListProvidersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateProviderUrl: () => string;
/**
 * @summary Create a new provider (admin only)
 */
export declare const createProvider: (providerInput: ProviderInput, options?: RequestInit) => Promise<Provider>;
export declare const getCreateProviderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProvider>>, TError, {
        data: BodyType<ProviderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createProvider>>, TError, {
    data: BodyType<ProviderInput>;
}, TContext>;
export type CreateProviderMutationResult = NonNullable<Awaited<ReturnType<typeof createProvider>>>;
export type CreateProviderMutationBody = BodyType<ProviderInput>;
export type CreateProviderMutationError = ErrorType<unknown>;
/**
* @summary Create a new provider (admin only)
*/
export declare const useCreateProvider: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProvider>>, TError, {
        data: BodyType<ProviderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createProvider>>, TError, {
    data: BodyType<ProviderInput>;
}, TContext>;
export declare const getGetProviderUrl: (id: number) => string;
/**
 * @summary Get a single provider by ID
 */
export declare const getProvider: (id: number, options?: RequestInit) => Promise<Provider>;
export declare const getGetProviderQueryKey: (id: number) => readonly [`/api/providers/${number}`];
export declare const getGetProviderQueryOptions: <TData = Awaited<ReturnType<typeof getProvider>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProvider>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProvider>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProviderQueryResult = NonNullable<Awaited<ReturnType<typeof getProvider>>>;
export type GetProviderQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a single provider by ID
 */
export declare function useGetProvider<TData = Awaited<ReturnType<typeof getProvider>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProvider>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateProviderUrl: (id: number) => string;
/**
 * @summary Update a provider (admin only)
 */
export declare const updateProvider: (id: number, providerUpdate: ProviderUpdate, options?: RequestInit) => Promise<Provider>;
export declare const getUpdateProviderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
        id: number;
        data: BodyType<ProviderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
    id: number;
    data: BodyType<ProviderUpdate>;
}, TContext>;
export type UpdateProviderMutationResult = NonNullable<Awaited<ReturnType<typeof updateProvider>>>;
export type UpdateProviderMutationBody = BodyType<ProviderUpdate>;
export type UpdateProviderMutationError = ErrorType<unknown>;
/**
* @summary Update a provider (admin only)
*/
export declare const useUpdateProvider: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
        id: number;
        data: BodyType<ProviderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProvider>>, TError, {
    id: number;
    data: BodyType<ProviderUpdate>;
}, TContext>;
export declare const getDeleteProviderUrl: (id: number) => string;
/**
 * @summary Delete a provider (admin only)
 */
export declare const deleteProvider: (id: number, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getDeleteProviderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProvider>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProvider>>, TError, {
    id: number;
}, TContext>;
export type DeleteProviderMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProvider>>>;
export type DeleteProviderMutationError = ErrorType<unknown>;
/**
* @summary Delete a provider (admin only)
*/
export declare const useDeleteProvider: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProvider>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProvider>>, TError, {
    id: number;
}, TContext>;
export declare const getGetProviderServicesUrl: (id: number) => string;
/**
 * @summary Get services offered at a provider location
 */
export declare const getProviderServices: (id: number, options?: RequestInit) => Promise<ServiceCategory[]>;
export declare const getGetProviderServicesQueryKey: (id: number) => readonly [`/api/providers/${number}/services`];
export declare const getGetProviderServicesQueryOptions: <TData = Awaited<ReturnType<typeof getProviderServices>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProviderServices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProviderServices>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProviderServicesQueryResult = NonNullable<Awaited<ReturnType<typeof getProviderServices>>>;
export type GetProviderServicesQueryError = ErrorType<unknown>;
/**
 * @summary Get services offered at a provider location
 */
export declare function useGetProviderServices<TData = Awaited<ReturnType<typeof getProviderServices>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProviderServices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListCategoriesUrl: () => string;
/**
 * @summary List all service categories
 */
export declare const listCategories: (options?: RequestInit) => Promise<ServiceCategory[]>;
export declare const getListCategoriesQueryKey: () => readonly ["/api/categories"];
export declare const getListCategoriesQueryOptions: <TData = Awaited<ReturnType<typeof listCategories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCategories>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCategoriesQueryResult = NonNullable<Awaited<ReturnType<typeof listCategories>>>;
export type ListCategoriesQueryError = ErrorType<unknown>;
/**
 * @summary List all service categories
 */
export declare function useListCategories<TData = Awaited<ReturnType<typeof listCategories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCategoryUrl: () => string;
/**
 * @summary Create a service category (admin only)
 */
export declare const createCategory: (serviceCategoryInput: ServiceCategoryInput, options?: RequestInit) => Promise<ServiceCategory>;
export declare const getCreateCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCategory>>, TError, {
        data: BodyType<ServiceCategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCategory>>, TError, {
    data: BodyType<ServiceCategoryInput>;
}, TContext>;
export type CreateCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof createCategory>>>;
export type CreateCategoryMutationBody = BodyType<ServiceCategoryInput>;
export type CreateCategoryMutationError = ErrorType<unknown>;
/**
* @summary Create a service category (admin only)
*/
export declare const useCreateCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCategory>>, TError, {
        data: BodyType<ServiceCategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCategory>>, TError, {
    data: BodyType<ServiceCategoryInput>;
}, TContext>;
export declare const getListServiceRequestsUrl: (params?: ListServiceRequestsParams) => string;
/**
 * @summary List service requests (admin only)
 */
export declare const listServiceRequests: (params?: ListServiceRequestsParams, options?: RequestInit) => Promise<ServiceRequest[]>;
export declare const getListServiceRequestsQueryKey: (params?: ListServiceRequestsParams) => readonly ["/api/service-requests", ...ListServiceRequestsParams[]];
export declare const getListServiceRequestsQueryOptions: <TData = Awaited<ReturnType<typeof listServiceRequests>>, TError = ErrorType<unknown>>(params?: ListServiceRequestsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listServiceRequests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listServiceRequests>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListServiceRequestsQueryResult = NonNullable<Awaited<ReturnType<typeof listServiceRequests>>>;
export type ListServiceRequestsQueryError = ErrorType<unknown>;
/**
 * @summary List service requests (admin only)
 */
export declare function useListServiceRequests<TData = Awaited<ReturnType<typeof listServiceRequests>>, TError = ErrorType<unknown>>(params?: ListServiceRequestsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listServiceRequests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateServiceRequestUrl: () => string;
/**
 * @summary Submit a new service request
 */
export declare const createServiceRequest: (serviceRequestInput: ServiceRequestInput, options?: RequestInit) => Promise<ServiceRequest>;
export declare const getCreateServiceRequestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createServiceRequest>>, TError, {
        data: BodyType<ServiceRequestInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createServiceRequest>>, TError, {
    data: BodyType<ServiceRequestInput>;
}, TContext>;
export type CreateServiceRequestMutationResult = NonNullable<Awaited<ReturnType<typeof createServiceRequest>>>;
export type CreateServiceRequestMutationBody = BodyType<ServiceRequestInput>;
export type CreateServiceRequestMutationError = ErrorType<unknown>;
/**
* @summary Submit a new service request
*/
export declare const useCreateServiceRequest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createServiceRequest>>, TError, {
        data: BodyType<ServiceRequestInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createServiceRequest>>, TError, {
    data: BodyType<ServiceRequestInput>;
}, TContext>;
export declare const getUpdateServiceRequestUrl: (id: number) => string;
/**
 * @summary Update service request status (admin only)
 */
export declare const updateServiceRequest: (id: number, serviceRequestUpdate: ServiceRequestUpdate, options?: RequestInit) => Promise<ServiceRequest>;
export declare const getUpdateServiceRequestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateServiceRequest>>, TError, {
        id: number;
        data: BodyType<ServiceRequestUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateServiceRequest>>, TError, {
    id: number;
    data: BodyType<ServiceRequestUpdate>;
}, TContext>;
export type UpdateServiceRequestMutationResult = NonNullable<Awaited<ReturnType<typeof updateServiceRequest>>>;
export type UpdateServiceRequestMutationBody = BodyType<ServiceRequestUpdate>;
export type UpdateServiceRequestMutationError = ErrorType<unknown>;
/**
* @summary Update service request status (admin only)
*/
export declare const useUpdateServiceRequest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateServiceRequest>>, TError, {
        id: number;
        data: BodyType<ServiceRequestUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateServiceRequest>>, TError, {
    id: number;
    data: BodyType<ServiceRequestUpdate>;
}, TContext>;
export declare const getRecordSearchEventUrl: () => string;
/**
 * @summary Record a search event for analytics
 */
export declare const recordSearchEvent: (searchEventInput: SearchEventInput, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getRecordSearchEventMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof recordSearchEvent>>, TError, {
        data: BodyType<SearchEventInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof recordSearchEvent>>, TError, {
    data: BodyType<SearchEventInput>;
}, TContext>;
export type RecordSearchEventMutationResult = NonNullable<Awaited<ReturnType<typeof recordSearchEvent>>>;
export type RecordSearchEventMutationBody = BodyType<SearchEventInput>;
export type RecordSearchEventMutationError = ErrorType<unknown>;
/**
* @summary Record a search event for analytics
*/
export declare const useRecordSearchEvent: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof recordSearchEvent>>, TError, {
        data: BodyType<SearchEventInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof recordSearchEvent>>, TError, {
    data: BodyType<SearchEventInput>;
}, TContext>;
export declare const getGetAnalyticsSummaryUrl: () => string;
/**
 * @summary Get high-level analytics summary (admin only)
 */
export declare const getAnalyticsSummary: (options?: RequestInit) => Promise<AnalyticsSummary>;
export declare const getGetAnalyticsSummaryQueryKey: () => readonly ["/api/analytics/summary"];
export declare const getGetAnalyticsSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getAnalyticsSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAnalyticsSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getAnalyticsSummary>>>;
export type GetAnalyticsSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get high-level analytics summary (admin only)
 */
export declare function useGetAnalyticsSummary<TData = Awaited<ReturnType<typeof getAnalyticsSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetTopServicesUrl: (params?: GetTopServicesParams) => string;
/**
 * @summary Get most searched service types (admin only)
 */
export declare const getTopServices: (params?: GetTopServicesParams, options?: RequestInit) => Promise<ServiceCount[]>;
export declare const getGetTopServicesQueryKey: (params?: GetTopServicesParams) => readonly ["/api/analytics/top-services", ...GetTopServicesParams[]];
export declare const getGetTopServicesQueryOptions: <TData = Awaited<ReturnType<typeof getTopServices>>, TError = ErrorType<unknown>>(params?: GetTopServicesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTopServices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTopServices>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTopServicesQueryResult = NonNullable<Awaited<ReturnType<typeof getTopServices>>>;
export type GetTopServicesQueryError = ErrorType<unknown>;
/**
 * @summary Get most searched service types (admin only)
 */
export declare function useGetTopServices<TData = Awaited<ReturnType<typeof getTopServices>>, TError = ErrorType<unknown>>(params?: GetTopServicesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTopServices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetTopLocationsUrl: (params?: GetTopLocationsParams) => string;
/**
 * @summary Get most searched geographic locations (admin only)
 */
export declare const getTopLocations: (params?: GetTopLocationsParams, options?: RequestInit) => Promise<LocationCount[]>;
export declare const getGetTopLocationsQueryKey: (params?: GetTopLocationsParams) => readonly ["/api/analytics/top-locations", ...GetTopLocationsParams[]];
export declare const getGetTopLocationsQueryOptions: <TData = Awaited<ReturnType<typeof getTopLocations>>, TError = ErrorType<unknown>>(params?: GetTopLocationsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTopLocations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTopLocations>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTopLocationsQueryResult = NonNullable<Awaited<ReturnType<typeof getTopLocations>>>;
export type GetTopLocationsQueryError = ErrorType<unknown>;
/**
 * @summary Get most searched geographic locations (admin only)
 */
export declare function useGetTopLocations<TData = Awaited<ReturnType<typeof getTopLocations>>, TError = ErrorType<unknown>>(params?: GetTopLocationsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTopLocations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDemandHeatmapUrl: () => string;
/**
 * @summary Get search demand heatmap data (admin only)
 */
export declare const getDemandHeatmap: (options?: RequestInit) => Promise<HeatmapPoint[]>;
export declare const getGetDemandHeatmapQueryKey: () => readonly ["/api/analytics/demand-heatmap"];
export declare const getGetDemandHeatmapQueryOptions: <TData = Awaited<ReturnType<typeof getDemandHeatmap>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDemandHeatmap>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDemandHeatmap>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDemandHeatmapQueryResult = NonNullable<Awaited<ReturnType<typeof getDemandHeatmap>>>;
export type GetDemandHeatmapQueryError = ErrorType<unknown>;
/**
 * @summary Get search demand heatmap data (admin only)
 */
export declare function useGetDemandHeatmap<TData = Awaited<ReturnType<typeof getDemandHeatmap>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDemandHeatmap>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetEmployerTrendsUrl: (params?: GetEmployerTrendsParams) => string;
/**
 * @summary Get employer search trends (admin only)
 */
export declare const getEmployerTrends: (params?: GetEmployerTrendsParams, options?: RequestInit) => Promise<EmployerTrend[]>;
export declare const getGetEmployerTrendsQueryKey: (params?: GetEmployerTrendsParams) => readonly ["/api/analytics/employer-trends", ...GetEmployerTrendsParams[]];
export declare const getGetEmployerTrendsQueryOptions: <TData = Awaited<ReturnType<typeof getEmployerTrends>>, TError = ErrorType<unknown>>(params?: GetEmployerTrendsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEmployerTrends>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getEmployerTrends>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetEmployerTrendsQueryResult = NonNullable<Awaited<ReturnType<typeof getEmployerTrends>>>;
export type GetEmployerTrendsQueryError = ErrorType<unknown>;
/**
 * @summary Get employer search trends (admin only)
 */
export declare function useGetEmployerTrends<TData = Awaited<ReturnType<typeof getEmployerTrends>>, TError = ErrorType<unknown>>(params?: GetEmployerTrendsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEmployerTrends>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetZeroResultSearchesUrl: (params?: GetZeroResultSearchesParams) => string;
/**
 * @summary Get searches that returned zero results (admin only)
 */
export declare const getZeroResultSearches: (params?: GetZeroResultSearchesParams, options?: RequestInit) => Promise<SearchEvent[]>;
export declare const getGetZeroResultSearchesQueryKey: (params?: GetZeroResultSearchesParams) => readonly ["/api/analytics/zero-result-searches", ...GetZeroResultSearchesParams[]];
export declare const getGetZeroResultSearchesQueryOptions: <TData = Awaited<ReturnType<typeof getZeroResultSearches>>, TError = ErrorType<unknown>>(params?: GetZeroResultSearchesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getZeroResultSearches>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getZeroResultSearches>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetZeroResultSearchesQueryResult = NonNullable<Awaited<ReturnType<typeof getZeroResultSearches>>>;
export type GetZeroResultSearchesQueryError = ErrorType<unknown>;
/**
 * @summary Get searches that returned zero results (admin only)
 */
export declare function useGetZeroResultSearches<TData = Awaited<ReturnType<typeof getZeroResultSearches>>, TError = ErrorType<unknown>>(params?: GetZeroResultSearchesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getZeroResultSearches>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetRecentSearchesUrl: (params?: GetRecentSearchesParams) => string;
/**
 * @summary Get recent search events (admin only)
 */
export declare const getRecentSearches: (params?: GetRecentSearchesParams, options?: RequestInit) => Promise<SearchEvent[]>;
export declare const getGetRecentSearchesQueryKey: (params?: GetRecentSearchesParams) => readonly ["/api/analytics/recent-searches", ...GetRecentSearchesParams[]];
export declare const getGetRecentSearchesQueryOptions: <TData = Awaited<ReturnType<typeof getRecentSearches>>, TError = ErrorType<unknown>>(params?: GetRecentSearchesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentSearches>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getRecentSearches>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetRecentSearchesQueryResult = NonNullable<Awaited<ReturnType<typeof getRecentSearches>>>;
export type GetRecentSearchesQueryError = ErrorType<unknown>;
/**
 * @summary Get recent search events (admin only)
 */
export declare function useGetRecentSearches<TData = Awaited<ReturnType<typeof getRecentSearches>>, TError = ErrorType<unknown>>(params?: GetRecentSearchesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentSearches>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListUsersUrl: () => string;
/**
 * @summary List all users (admin only)
 */
export declare const listUsers: (options?: RequestInit) => Promise<User[]>;
export declare const getListUsersQueryKey: () => readonly ["/api/users"];
export declare const getListUsersQueryOptions: <TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListUsersQueryResult = NonNullable<Awaited<ReturnType<typeof listUsers>>>;
export type ListUsersQueryError = ErrorType<unknown>;
/**
 * @summary List all users (admin only)
 */
export declare function useListUsers<TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateUserUrl: (id: number) => string;
/**
 * @summary Update user role or status (admin only)
 */
export declare const updateUser: (id: number, userUpdate: UserUpdate, options?: RequestInit) => Promise<User>;
export declare const getUpdateUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<UserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<UserUpdate>;
}, TContext>;
export type UpdateUserMutationResult = NonNullable<Awaited<ReturnType<typeof updateUser>>>;
export type UpdateUserMutationBody = BodyType<UserUpdate>;
export type UpdateUserMutationError = ErrorType<unknown>;
/**
* @summary Update user role or status (admin only)
*/
export declare const useUpdateUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<UserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<UserUpdate>;
}, TContext>;
export declare const getDeleteUserUrl: (id: number) => string;
/**
 * @summary Delete a user (admin only)
 */
export declare const deleteUser: (id: number, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getDeleteUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export type DeleteUserMutationResult = NonNullable<Awaited<ReturnType<typeof deleteUser>>>;
export type DeleteUserMutationError = ErrorType<unknown>;
/**
* @summary Delete a user (admin only)
*/
export declare const useDeleteUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export declare const getListInvitationsUrl: () => string;
/**
 * @summary List all invitations (admin only)
 */
export declare const listInvitations: (options?: RequestInit) => Promise<Invitation[]>;
export declare const getListInvitationsQueryKey: () => readonly ["/api/invitations"];
export declare const getListInvitationsQueryOptions: <TData = Awaited<ReturnType<typeof listInvitations>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listInvitations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listInvitations>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListInvitationsQueryResult = NonNullable<Awaited<ReturnType<typeof listInvitations>>>;
export type ListInvitationsQueryError = ErrorType<unknown>;
/**
 * @summary List all invitations (admin only)
 */
export declare function useListInvitations<TData = Awaited<ReturnType<typeof listInvitations>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listInvitations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateInvitationUrl: () => string;
/**
 * @summary Create and send an invitation (admin only)
 */
export declare const createInvitation: (invitationInput: InvitationInput, options?: RequestInit) => Promise<Invitation>;
export declare const getCreateInvitationMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createInvitation>>, TError, {
        data: BodyType<InvitationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createInvitation>>, TError, {
    data: BodyType<InvitationInput>;
}, TContext>;
export type CreateInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof createInvitation>>>;
export type CreateInvitationMutationBody = BodyType<InvitationInput>;
export type CreateInvitationMutationError = ErrorType<unknown>;
/**
* @summary Create and send an invitation (admin only)
*/
export declare const useCreateInvitation: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createInvitation>>, TError, {
        data: BodyType<InvitationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createInvitation>>, TError, {
    data: BodyType<InvitationInput>;
}, TContext>;
export declare const getGetInvitationUrl: (token: string) => string;
/**
 * @summary Get invitation details by token
 */
export declare const getInvitation: (token: string, options?: RequestInit) => Promise<Invitation>;
export declare const getGetInvitationQueryKey: (token: string) => readonly [`/api/invitations/${string}`];
export declare const getGetInvitationQueryOptions: <TData = Awaited<ReturnType<typeof getInvitation>>, TError = ErrorType<ErrorResponse>>(token: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getInvitation>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getInvitation>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetInvitationQueryResult = NonNullable<Awaited<ReturnType<typeof getInvitation>>>;
export type GetInvitationQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get invitation details by token
 */
export declare function useGetInvitation<TData = Awaited<ReturnType<typeof getInvitation>>, TError = ErrorType<ErrorResponse>>(token: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getInvitation>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAcceptInvitationUrl: (token: string) => string;
/**
 * @summary Accept an invitation and create account
 */
export declare const acceptInvitation: (token: string, acceptInvitationInput: AcceptInvitationInput, options?: RequestInit) => Promise<AuthUser>;
export declare const getAcceptInvitationMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof acceptInvitation>>, TError, {
        token: string;
        data: BodyType<AcceptInvitationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof acceptInvitation>>, TError, {
    token: string;
    data: BodyType<AcceptInvitationInput>;
}, TContext>;
export type AcceptInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof acceptInvitation>>>;
export type AcceptInvitationMutationBody = BodyType<AcceptInvitationInput>;
export type AcceptInvitationMutationError = ErrorType<unknown>;
/**
* @summary Accept an invitation and create account
*/
export declare const useAcceptInvitation: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof acceptInvitation>>, TError, {
        token: string;
        data: BodyType<AcceptInvitationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof acceptInvitation>>, TError, {
    token: string;
    data: BodyType<AcceptInvitationInput>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map