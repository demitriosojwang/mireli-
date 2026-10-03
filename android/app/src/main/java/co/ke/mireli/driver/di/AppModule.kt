package co.ke.mireli.driver.di

import android.content.Context
import androidx.room.Room
import co.ke.mireli.driver.BuildConfig
import co.ke.mireli.driver.data.local.MireliDatabase
import co.ke.mireli.driver.data.local.SecureTokenStore
import co.ke.mireli.driver.data.remote.AuthInterceptor
import co.ke.mireli.driver.data.remote.MireliDriverApi
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Dependency wiring for the data layer.
 *
 * Timeouts are deliberately short. A driver at a terminus tapping "board"
 * needs an answer in seconds, and a slow 30-second default would leave the app
 * looking frozen and tempt a double tap — which the idempotency layer would
 * then have to absorb. Failing fast is better than failing slowly here.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        // A newer server may add fields this build does not know. It must not
        // crash the app — ignore what we cannot use.
        ignoreUnknownKeys = true
        // Absent nullable fields decode as null rather than throwing.
        explicitNulls = false
        coerceInputValues = true
    }

    @Provides
    @Singleton
    fun provideOkHttp(authInterceptor: AuthInterceptor): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            // Retry on connection failure only. Never blindly retry a POST that
            // may already have succeeded — that is what clientActionId exists
            // to make safe, and it is handled in the repository, not here.
            .retryOnConnectionFailure(true)

        // Body logging is DEBUG-ONLY. A release build must never write passenger
        // names, phone numbers or bearer tokens to logcat, which is readable by
        // anyone with a debug bridge and is often collected in crash reports.
        if (BuildConfig.ENABLE_NETWORK_LOGGING) {
            builder.addInterceptor(
                HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
            )
        }
        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    @Provides
    @Singleton
    fun provideDriverApi(retrofit: Retrofit): MireliDriverApi =
        retrofit.create(MireliDriverApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
object StorageModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MireliDatabase =
        Room.databaseBuilder(context, MireliDatabase::class.java, MireliDatabase.NAME)
            // No destructive fallback in production: a silent wipe would discard
            // queued boarding actions a driver has not yet synced.
            .build()

    @Provides
    fun providePendingActionDao(db: MireliDatabase) = db.pendingActionDao()
}