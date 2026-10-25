package com.hanseo.dearshot.ui.theme

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.ui.Modifier
import androidx.compose.ui.node.DelegatableNode

internal data object NoIndication : IndicationNodeFactory {

    override fun create(
        interactionSource: InteractionSource,
    ): DelegatableNode {
        return object : Modifier.Node() {}
    }
}