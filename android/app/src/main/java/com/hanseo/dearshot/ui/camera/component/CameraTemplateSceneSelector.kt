package com.hanseo.dearshot.ui.camera.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.camera.TemplateSceneSelectionState

// 장소 선택 영역에 사용하는 버건디 강조색.
private val SceneAccent = Color(0xFF783F4A)

@Composable
fun CameraTemplateSceneSelector(
    state: TemplateSceneSelectionState,
    onSceneSelected: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedScene = state.scenes.find { it.key == state.selectedKey }
    val arrowRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        label = "sceneSelectorArrow",
    )

    Column(
        modifier = Modifier
            .padding(horizontal = 24.dp, vertical = 8.dp),
    ) {
        Surface(
            onClick = { expanded = !expanded },
            enabled = !state.isLoading && state.scenes.isNotEmpty(),
            shape = RoundedCornerShape(16.dp),
            color = SceneAccent.copy(alpha = 0.08f),
            contentColor = SceneAccent,
            border = BorderStroke(1.dp, SceneAccent.copy(alpha = 0.18f)),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.template_selection_location_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = SceneAccent.copy(alpha = 0.75f),
                    )
                    Text(
                        selectedScene?.displayName
                            ?: stringResource(R.string.template_selection_choose_scene),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    stringResource(R.string.template_selection_change_location),
                    style = MaterialTheme.typography.labelMedium,
                )
                Canvas(modifier = Modifier.size(14.dp).rotate(arrowRotation)) {
                    val stroke = 1.7.dp.toPx()
                    drawLine(SceneAccent, Offset(size.width * 0.15f, size.height * 0.35f),
                        Offset(size.width * 0.5f, size.height * 0.7f), stroke, StrokeCap.Round)
                    drawLine(SceneAccent, Offset(size.width * 0.5f, size.height * 0.7f),
                        Offset(size.width * 0.85f, size.height * 0.35f), stroke, StrokeCap.Round)
                }
            }
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp),
                contentPadding = PaddingValues(vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.scenes, key = { it.key }) { scene ->
                    val isSelected = scene.key == state.selectedKey
                    Surface(
                        onClick = {
                            expanded = false
                            onSceneSelected(scene.key)
                        },
                        modifier = Modifier.semantics {
                            selected = isSelected
                            role = Role.RadioButton
                        },
                        shape = RoundedCornerShape(12.dp),
                        color = if (isSelected) SceneAccent
                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        contentColor = if (isSelected) Color.White
                            else MaterialTheme.colorScheme.onSurface,
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                scene.displayName,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                stringResource(R.string.template_selection_location_count, scene.templateCount),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isSelected) Color.White.copy(alpha = 0.75f)
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
