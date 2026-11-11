package com.hanseo.dearshot.data.local.photo

import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** 프로세스 안에서는 유지하고, 프로세스가 새로 시작되면 새 ID를 만든다. */
@Singleton
class CaptureSessionStore @Inject constructor() {
    val sessionId: String = UUID.randomUUID().toString()
}
