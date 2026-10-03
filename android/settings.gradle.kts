pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MireliDriver"
// :app is the only module in the MVP. A :core or :feature split is a later
// refactor — premature multi-module scaffolding slows an MVP without making it
// safer, and this module boundary is already clean (data/domain/ui packages).
include(":app")