# Extracted from working Nov 3 image: asia-east1-docker.pkg.dev/cityos-392102/mtc-containers/mtc-backend@sha256:232162d51c90a0725f8a8169818af978b03456ceb740e7560fefdcbd6d1d62d1

@dataclass(kw_only=True, frozen=True)
class GpsPositionProcessingResult:
    speed: float | None


class GpsPositionPublisher(VehicleDataPublisher):
    def on_gps_position(self, gps_position: GpsPosition) -> GpsPositionProcessingResult:
        speed: float | None = None
        if gps_position.gps_status_decoded in [
            GpsStatus.FIX_2D,
            GpsStatus.FIX_3d,
        ]:
            way_point = gps_position.wayPoint
            if way_point:
                if way_point.speed is not None:
                    speed = way_point.speed / 10.0

                self._publish(
                    topic=mqtt_topics.LOCATION_HEADING,
                    value=way_point.heading,
                )

                position = way_point.position
                if (
                    position
                    and (raw_lat := position.latitude) is not None
                    and (raw_long := position.longitude) is not None
                ):
                    latitude = raw_lat / 1000000.0
                    longitude = raw_long / 1000000.0
                    if abs(latitude) <= 90 and abs(longitude) <= 180:
                        self._publish(
                            topic=mqtt_topics.LOCATION_LATITUDE, value=latitude
                        )
                        self._publish(
                            topic=mqtt_topics.LOCATION_LONGITUDE, value=longitude
                        )
                        position_json = {
                            "latitude": latitude,
                            "longitude": longitude,
                        }
                        _, altitude = self._publish(
                            topic=mqtt_topics.LOCATION_ELEVATION,
                            value=position.altitude,
                            validator=lambda x: value_in_range(x, -500, 8900),
                        )
                        if altitude is not None:
                            position_json["altitude"] = altitude
                        self._publish(
                            topic=mqtt_topics.LOCATION_POSITION,
                            value=position_json,
                        )
        return GpsPositionProcessingResult(speed=speed)
