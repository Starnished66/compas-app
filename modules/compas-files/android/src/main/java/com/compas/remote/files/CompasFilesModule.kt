package com.compas.remote.files

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Upper bound for one folder selection so a mistaken pick of a whole volume stays bounded. */
private const val MAX_COLLECTED_FILES = 10_000
private const val MAX_WALK_DEPTH = 16

private class StorageAccessException(message: String) : CodedException("ERR_STORAGE_ACCESS", message, null)
private class InvalidPathException(message: String) : CodedException("ERR_INVALID_PATH", message, null)

class CompasFilesModule : Module() {
    private val context: Context
        get() = appContext.reactContext?.applicationContext
            ?: throw IllegalStateException("React context is unavailable")

    override fun definition() = ModuleDefinition {
        Name("CompasFiles")

        Function("hasStorageAccess") {
            hasStorageAccess()
        }

        /** True when access is granted through the all-files Settings screen rather than a runtime dialog. */
        Function("usesAllFilesAccess") {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
        }

        Function("openAllFilesAccessSettings") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function false
            val activity = appContext.currentActivity
            val appIntent = Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            val fallback = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
            for (intent in listOf(appIntent, fallback)) {
                try {
                    if (activity != null) activity.startActivity(intent)
                    else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    return@Function true
                } catch (_: Exception) {
                    // Some vendors omit the per-app screen; try the global list next.
                }
            }
            false
        }

        Function("getRoots") {
            storageRoots()
        }

        AsyncFunction("listDirectory") { path: String ->
            requireAccess()
            val directory = resolveDirectory(path)
            val children = directory.listFiles() ?: throw StorageAccessException("Could not read ${directory.name}")
            children
                .filter { !it.name.startsWith(".") }
                .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
                .map { entryOf(it) }
        }

        /** Expands selected files and folders into a flat upload list; folders keep their own name as the top level. */
        AsyncFunction("collectFiles") { paths: List<String> ->
            requireAccess()
            val collected = ArrayList<Map<String, Any>>()
            for (path in paths) {
                val file = resolveExisting(path)
                if (file.isDirectory) walk(file, file.name, 0, collected)
                else addFile(file, "", collected)
            }
            collected
        }
    }

    private fun hasStorageAccess(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }

    private fun requireAccess() {
        if (!hasStorageAccess()) throw StorageAccessException("Allow file access to browse this device")
    }

    private fun storageRoots(): List<Map<String, Any>> {
        val roots = LinkedHashMap<String, Map<String, Any>>()
        val primary = Environment.getExternalStorageDirectory()
        roots[primary.absolutePath] = mapOf("name" to "Internal storage", "path" to primary.absolutePath, "removable" to false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val manager = context.getSystemService(StorageManager::class.java)
            manager?.storageVolumes?.forEach { volume ->
                val directory = volume.directory ?: return@forEach
                if (volume.state != Environment.MEDIA_MOUNTED && volume.state != Environment.MEDIA_MOUNTED_READ_ONLY) return@forEach
                if (roots.containsKey(directory.absolutePath)) return@forEach
                roots[directory.absolutePath] = mapOf(
                    "name" to volume.getDescription(context),
                    "path" to directory.absolutePath,
                    "removable" to volume.isRemovable,
                )
            }
        }
        return roots.values.toList()
    }

    private fun isWithinRoots(file: File): Boolean {
        val canonical = file.canonicalPath
        return storageRoots().any { root ->
            val rootPath = File(root["path"] as String).canonicalPath
            canonical == rootPath || canonical.startsWith("$rootPath/")
        }
    }

    private fun resolveExisting(path: String): File {
        if (!path.startsWith("/")) throw InvalidPathException("Expected an absolute path")
        val file = File(path)
        if (!file.exists() || !isWithinRoots(file)) throw InvalidPathException("${file.name} is not available")
        return file
    }

    private fun resolveDirectory(path: String): File {
        val file = resolveExisting(path)
        if (!file.isDirectory) throw InvalidPathException("${file.name} is not a folder")
        return file
    }

    private fun entryOf(file: File): Map<String, Any> = mapOf(
        "name" to file.name,
        "path" to file.absolutePath,
        "isDirectory" to file.isDirectory,
        "size" to if (file.isDirectory) 0.0 else file.length().toDouble(),
        "modified" to file.lastModified().toDouble(),
    )

    private fun addFile(file: File, relativeDir: String, out: MutableList<Map<String, Any>>) {
        if (out.size >= MAX_COLLECTED_FILES) throw StorageAccessException("Choose fewer than $MAX_COLLECTED_FILES files at once")
        out.add(mapOf(
            "path" to file.absolutePath,
            "name" to file.name,
            "relativeDir" to relativeDir,
            "size" to file.length().toDouble(),
        ))
    }

    private fun walk(directory: File, relativeDir: String, depth: Int, out: MutableList<Map<String, Any>>) {
        if (depth > MAX_WALK_DEPTH) return
        val children = directory.listFiles() ?: return
        children
            .filter { !it.name.startsWith(".") }
            .sortedWith(compareBy<File>({ it.isDirectory }, { it.name.lowercase() }))
            .forEach { child ->
                if (child.isDirectory) walk(child, "$relativeDir/${child.name}", depth + 1, out)
                else if (child.isFile) addFile(child, relativeDir, out)
            }
    }
}
