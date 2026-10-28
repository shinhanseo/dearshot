package com.hanseo.dearshot.analysis.recommendation

enum class RecommendationPhase {
    SEARCHING,
    STABILIZING,
    REQUESTING,
    GUIDING,
}

/**
 * 한 프레임에서 얻은 판단 재료.
 *
 * capturedAtMs:
 * SystemClock.elapsedRealtime() 기준 시각.
 *
 * sceneKey:
 * 장소를 나타내는 값. 아직 확신할 수 없으면 null.
 *
 * isStable:
 * 별도의 프레임 변화 감지기가 판단한 화면 안정 여부.
 *
 * hasPerson:
 * 객체 인식 결과에 사람이 있는지 여부.
 */
data class RecommendationObservation(
    val capturedAtMs: Long,
    val sceneKey: String?,
    val isStable: Boolean,
    val hasPerson: Boolean,
)

/**
 * 요청을 구분하는 번호.
 *
 * 요청 중 다시 분석을 시작하면 이전 요청의 결과는 무시한다.
 */
data class RecommendationTicket(
    val generation: Long,
)

data class RecommendationDecision(
    val phase: RecommendationPhase,
    val ticket: RecommendationTicket? = null,
)

/**
 * 카메라 분석 스레드와 UI 스레드에서 접근할 수 있어
 * 상태를 변경하는 함수는 synchronized로 보호한다.
 */
class RecommendationGate(
    private val stableDurationMs: Long = 1_000L,
    private val minimumObservations: Int = 3,
    private val maximumObservationGapMs: Long = 750L,
    private val requirePerson: Boolean = true,
) {
    init {
        require(stableDurationMs >= 0)
        require(minimumObservations >= 2)
        require(maximumObservationGapMs > 0)
    }

    private var phase = RecommendationPhase.SEARCHING

    private var generation = 0L

    private var candidateScene: String? = null
    private var stableSinceMs: Long? = null
    private var lastObservedAtMs: Long? = null
    private var observationCount = 0

    /**
     * 새 분석 결과가 들어올 때 호출한다.
     *
     * ticket이 반환된 경우에만 추천 요청을 시작한다.
     */
    @Synchronized
    fun observe(
        observation: RecommendationObservation,
    ): RecommendationDecision {
        // 이미 요청 중이거나 가이드를 사용하는 동안에는
        // 새로운 추천을 만들지 않는다.
        if (
            phase == RecommendationPhase.REQUESTING ||
            phase == RecommendationPhase.GUIDING
        ) {
            return RecommendationDecision(phase)
        }

        val scene = observation.sceneKey

        val canConsider = observation.isStable &&
                !scene.isNullOrBlank() &&
                (!requirePerson || observation.hasPerson)

        if (!canConsider) {
            clearCandidate()
            phase = RecommendationPhase.SEARCHING

            return RecommendationDecision(phase)
        }

        val now = observation.capturedAtMs
        val previous = lastObservedAtMs

        val isContinuous = previous != null &&
                now > previous &&
                now - previous <= maximumObservationGapMs

        // 장소가 달라졌거나 관측이 끊겼다면
        // 안정 시간을 처음부터 다시 센다.
        if (candidateScene != scene || !isContinuous) {
            candidateScene = scene
            stableSinceMs = now
            observationCount = 1
        } else {
            observationCount += 1
        }

        lastObservedAtMs = now
        phase = RecommendationPhase.STABILIZING

        val stableSince = checkNotNull(stableSinceMs)

        val isReady =
            now - stableSince >= stableDurationMs &&
                    observationCount >= minimumObservations

        if (!isReady) {
            return RecommendationDecision(phase)
        }

        generation += 1
        phase = RecommendationPhase.REQUESTING

        return RecommendationDecision(
            phase = phase,
            ticket = RecommendationTicket(generation),
        )
    }

    /**
     * 현재 요청의 추천 결과를 받았을 때 호출한다.
     *
     * true면 화면에 결과를 적용해도 된다.
     * false면 이미 무효화된 요청이므로 무시한다.
     */
    @Synchronized
    fun onRecommendationSucceeded(
        ticket: RecommendationTicket,
    ): Boolean {
        if (
            phase != RecommendationPhase.REQUESTING ||
            ticket.generation != generation
        ) {
            return false
        }

        phase = RecommendationPhase.GUIDING
        return true
    }

    /**
     * 실패 시 자동으로 반복 요청하지 않는다.
     * 오류 UI를 보여주고 사용자의 재시도를 기다린다.
     */
    @Synchronized
    fun onRecommendationFailed(
        ticket: RecommendationTicket,
    ): Boolean {
        return phase == RecommendationPhase.REQUESTING &&
                ticket.generation == generation
    }

    /**
     * 다시 추천, 카메라 전환, 화면 종료 시 호출한다.
     * 기존 요청의 결과도 함께 무효화한다.
     */
    @Synchronized
    fun restart() {
        generation += 1
        clearCandidate()
        phase = RecommendationPhase.SEARCHING
    }

    @Synchronized
    fun currentPhase(): RecommendationPhase = phase

    private fun clearCandidate() {
        candidateScene = null
        stableSinceMs = null
        lastObservedAtMs = null
        observationCount = 0
    }
}