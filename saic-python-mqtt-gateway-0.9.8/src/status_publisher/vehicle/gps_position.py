from __future__ import annotations

import logging
from dataclasses import dataclass

from saic_ismart_client_ng.api.schema import GpsPosition, GpsStatus

import mqtt_topics
from status_publisher import VehicleDataPublisher
from utils import value_in_range

LOG = logging.getLogger(__name__)


@dataclass(kw_only=True, frozen=True)
class GpsPositionProcessingResult:
    speed: float | None


class GpsPositionPublisher(VehicleDataPublisher):
    def on_gps_position(self, gps_position: GpsPosition) -> GpsPositionProcessingResult:
        speed: float | None = None

        # Log GPS status for debugging
        LOG.debug(f"GPS Status: {gps_position.gps_status_decoded}, wayPoint present: {gps_position.wayPoint is not None}")

        # Always publish GPS coordinates if available, regardless of GPS status
        # to restore Nov 1-4 behavior (before SAIC API changes)
        way_point = gps_position.wayPoint
        if way_point:
            LOG.debug(f"wayPoint data: speed={way_point.speed}, heading={way_point.heading}, position={way_point.position is not None}")

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
                LOG.debug(f"GPS coordinates: lat={latitude}, lon={longitude}")
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
        else:
            LOG.debug("wayPoint is None, no GPS data to publish")

        return GpsPositionProcessingResult(speed=speed)
