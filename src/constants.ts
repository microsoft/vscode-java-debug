// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export const JAVA_LANGID: string = "java";
export const TELEMETRY_EVENT = "telemetry";
export const HCR_EVENT = "hotcodereplace";
export const USER_NOTIFICATION_EVENT = "usernotification";
export const ENABLE_NO_CONFIG_DEBUG = "java.debug.settings.enableNoConfigDebug";

export enum ClasspathVariable {
    Auto = "$Auto",
    Runtime = "$Runtime",
    Test = "$Test",
}
